import { MessageStatus, MessageType } from "@/generated/prisma/enums";
import {
  CONFIRM_BOOKING_BUTTON_ID,
  GREET_QUESTION_BUTTON_ID,
  CALL_US_BUTTON_ID,
  GROUP_BOOKING_BUTTON_ID,
  GROUP_ROOM_BUTTON_IDS,
  SHOW_LOCATION_BUTTON_ID,
  groupRoomsPrompt,
  GUEST_COUNT_BUTTON_VALUES,
  InteractivePrompt,
  ROOM_BOOK_BUTTON_ID,
  SEE_OTHER_ROOMS_BUTTON_ID,
  SHOW_OFFERS_BUTTON_ID,
  confirmBookingPrompt,
  dateQuickPickPrompt,
  greetMenuPrompt,
  looksLikeExistingBookingRequest,
  looksLikeRoomObjection,
  postBookingPrompt,
  roomResponsePrompt,
} from "@/lib/ai/interactive-prompts";
import { transcribeAudio } from "@/lib/ai/transcription";
import { todayMidnightIST } from "@/lib/india-time";
import { GuestLanguage, LANGUAGE_BUTTON_VALUES, resolveContactLanguageUpdate, resolveLanguage, t } from "@/lib/i18n/guest-language";
import { findUnavailableRoomIds, isRoomAvailable } from "@/lib/booking/availability";
import { roomsFittingParty } from "@/lib/booking/room-capacity";
import { takeOverFields } from "@/lib/crm/handover";
import { completeBooking } from "@/lib/booking/complete-booking";
import { matchOfferCode } from "@/lib/booking/offer-match";
import { matchRecommendedRoom } from "@/lib/booking/room-match";
import { CANCEL_BOOKING_ID, CHANGE_DATES_ID, KEEP_BOOKING_ID, beginReschedule, cancelBooking, findActiveBooking } from "@/lib/booking/manage-booking";
import { parseFlowDateRange } from "@/lib/booking/parse-flow-response";
import { resolveQuickPickDates } from "@/lib/booking/quick-pick-dates";
import {
  buildCheckInPickerMessage,
  buildNightsPickerMessage,
  checkOutAfterNights,
  describeStay,
  parseNightsFromText,
} from "@/lib/whatsapp/date-picker-message";
import { routeDatePickerTap } from "@/lib/whatsapp/date-picker-router";
import { fireBookingNotification } from "@/lib/contacts/fire-booking-notification";
import { messageQueue } from "@/lib/queue/queues";
import { prisma } from "@/lib/prisma";
import { downloadMedia, getMediaUrl, sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { buildFaqListMessage } from "@/lib/whatsapp/faq-list-message";
import { buildOfferListMessage } from "@/lib/whatsapp/offer-list-message";
import { isOptOutSignal } from "@/lib/whatsapp/opt-out";
import { buildRoomListMessage } from "@/lib/whatsapp/room-list-message";
import { getWhatsAppCredentials, resolveTenantByPhoneNumberId } from "@/lib/whatsapp/tenant-credentials";
import { InboundMessage, StatusUpdate } from "@/lib/whatsapp/webhook";
import { uploadObject } from "@/lib/storage/s3";

const OPT_OUT_CONFIRMATION = "You're unsubscribed from promotional messages and won't get any more offers or reminders. Message us anytime if you still need help with a booking.";

/**
 * The tenant's rooms, minus any already booked for the dates this guest has
 * settled on. Both room lists the guest can be shown go through here, for
 * the same reason the AI's own room list does (see availability.ts): a list
 * that offers a room the hotel can't actually give them is worse than a
 * shorter list, and the clash would otherwise only surface at the final tap.
 *
 * With no dates agreed yet there's nothing to check against, so the full
 * list is correct — that's a browsing guest, not a booking one.
 */
/**
 * The language this reply should be written in.
 *
 * An explicit pick wins and keeps winning — that is what picking it means.
 * Script is only consulted when nothing has been chosen yet, so a guest who
 * selected Hindi and then types a word in Roman letters doesn't get silently
 * switched back to English.
 */
function replyLanguage(contact: { language: string | null }): GuestLanguage {
  return resolveLanguage(contact.language);
}

async function bookableRooms(
  tenantId: string,
  contact: { pendingCheckIn: Date | null; pendingCheckOut: Date | null; pendingGuestCount?: number | null }
) {
  const all = await prisma.room.findMany({ where: { tenantId }, orderBy: { price: "asc" } });

  // Party size first. Probed live: a guest tapping "3+ people" was offered the
  // Classic Room, which sleeps 2 — the funnel would have taken them all the way
  // to a booking reference for a room that cannot hold them, and reception
  // finds out at check-in.
  //
  // Falls back to the full list when nothing fits rather than showing an empty
  // one: a party larger than any single room needs several rooms, which is a
  // conversation for a person, and the callers below already treat an empty
  // list as "no availability on these dates" — a different and wrong thing to
  // tell them.
  const rooms = roomsFittingParty(all, contact.pendingGuestCount);

  if (!contact.pendingCheckIn || !contact.pendingCheckOut) return rooms;
  const taken = await findUnavailableRoomIds(prisma, tenantId, contact.pendingCheckIn, contact.pendingCheckOut).catch(() => new Set<string>());
  return rooms.filter((r) => !taken.has(r.id));
}

function mapMessageType(type: InboundMessage["type"]): MessageType {
  switch (type) {
    case "text":
      return "TEXT";
    case "image":
      return "IMAGE";
    case "location":
      return "LOCATION";
    case "button":
    case "interactive":
      return "INTERACTIVE";
    // WhatsApp also sends audio/video/sticker; the schema keeps message
    // types to the ones the spec calls out and treats other media as a
    // generic document attachment.
    default:
      return "DOCUMENT";
  }
}

/** Downloads the raw bytes from WhatsApp — needed for transcription regardless of whether object storage is configured. */
async function downloadInboundMedia(tenantId: string, msg: InboundMessage): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!msg.mediaId) return null;
  const creds = await getWhatsAppCredentials(tenantId);
  if (!creds) return null;
  const { url, mimeType } = await getMediaUrl(creds, msg.mediaId);
  const { buffer, contentType } = await downloadMedia(creds, url);
  return { buffer, contentType: contentType || mimeType };
}

type ShortCircuitMessage =
  | { type: "text"; text: string }
  // The WhatsApp client has supported location messages all along; this union
  // simply never listed one, so no deterministic path could send a map pin.
  | { type: "location"; latitude: number; longitude: number; name?: string; address?: string }
  | { type: "interactive"; body: string; buttons: { id: string; title: string }[] }
  | { type: "list"; body: string; buttonText: string; sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[] }
  | { type: "flow"; body: string; flowId: string; flowCta: string; screen: string };

/**
 * Shared by every deterministic short-circuit below (opt-out, confirm-
 * booking, see-other-rooms, room-book): sends one outbound message and
 * persists the matching Message row, logging (not throwing) on failure — a
 * short-circuit's send failing shouldn't crash webhook processing, same
 * principle process-message-job.ts follows for the AI-driven path.
 */
async function sendAndPersist(
  tenant: { id: string },
  contact: { id: string; whatsappNumber: string },
  message: ShortCircuitMessage,
  errorLabel: string
): Promise<void> {
  const creds = await getWhatsAppCredentials(tenant.id);
  if (!creds) return;
  try {
    const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, message);
    await prisma.message.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        direction: "OUT",
        // A location has its own message type and no body text — persisting
        // it as INTERACTIVE with an undefined content is how the CRM ends up
        // showing an empty bubble for a pin that sent perfectly well.
        type: message.type === "text" ? "TEXT" : message.type === "location" ? "LOCATION" : "INTERACTIVE",
        content:
          message.type === "text"
            ? message.text
            : message.type === "location"
              ? (message.name ?? "Hotel location")
              : message.body,
        whatsappMessageId,
        status: "SENT",
      },
    });
  } catch (err) {
    console.error(`${errorLabel} for tenant ${tenant.id}, contact ${contact.id}:`, err);
  }
}

/** Converts an InteractivePrompt (buttons or list) plus body text into a ShortCircuitMessage — the one place that has to know both shapes. */
function toShortCircuitInteractive(body: string, prompt: InteractivePrompt): ShortCircuitMessage {
  return prompt.type === "list"
    ? { type: "list", body, buttonText: prompt.buttonText, sections: [{ rows: prompt.rows }] }
    : { type: "interactive", body, buttons: prompt.buttons };
}

const OFFER_MATCH_HISTORY_LIMIT = 20;

/** Scans this contact's recent conversation for a real offer code (e.g. "FLAT100") to snapshot onto the booking — see offer-match.ts. */
async function matchOfferForBooking(tenantId: string, contactId: string): Promise<{ id: string; title: string } | null> {
  const [offers, recentMessages] = await Promise.all([
    prisma.offer.findMany({ where: { tenantId, active: true }, select: { id: true, title: true, code: true } }),
    prisma.message.findMany({ where: { tenantId, contactId }, orderBy: { createdAt: "desc" }, take: OFFER_MATCH_HISTORY_LIMIT, select: { content: true } }),
  ]);
  return matchOfferCode(
    offers,
    recentMessages.map((m) => m.content ?? "")
  );
}

/**
 * The real-time-availability-gated booking completion, shared by both entry
 * points that can trigger it (a "Confirm booking" tap, and a completed
 * WhatsApp Flow submission) — both already know a specific room and both
 * exact dates, so this is the one place that decides whether to actually
 * book. Always sends its own reply and returns; callers just `return` after
 * calling it.
 */
async function attemptBookingCompletion(
  tenant: { id: string },
  contact: { id: string; name: string | null; phone: string; whatsappNumber: string; language: string | null },
  roomId: string,
  checkIn: Date,
  checkOut: Date
): Promise<void> {
  const lang = replyLanguage(contact);

  // Checked before availability, because a date that has already gone is not
  // an availability question at all. Reported live: a guest named a past
  // date and was walked all the way forward into a confirmed booking for it.
  // completeBooking now refuses this outright as a backstop; catching it
  // here is what turns that refusal into a real conversation rather than a
  // silent failure — the stale dates are cleared and the picker reopened, so
  // the guest lands somewhere they can actually recover from.
  if (checkIn.getTime() < todayMidnightIST().getTime()) {
    await prisma.contact.update({ where: { id: contact.id }, data: { pendingCheckIn: null, pendingCheckOut: null } });
    await sendAndPersist(
      tenant,
      contact,
      toShortCircuitInteractive(t(lang).pastDateRejected, dateQuickPickPrompt(lang)),
      "Failed to send past-date message"
    );
    return;
  }

  const available = await isRoomAvailable(prisma, tenant.id, roomId, checkIn, checkOut);
  if (available) {
    const matchedOffer = await matchOfferForBooking(tenant.id, contact.id);
    const booking = await completeBooking(prisma, tenant.id, contact.id, {
      roomId,
      checkIn,
      checkOut,
      offerId: matchedOffer?.id,
      offerSnapshot: matchedOffer?.title,
    });
    const confirmationText = `You're all set! Your booking reference is ${booking.referenceCode}. Please pay at the counter when you check in — see you soon! 🎉`;
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(confirmationText, postBookingPrompt(lang)), "Failed to send booking confirmation");
    return;
  }

  // Conflict — do not book. Clear the pending dates so the next answer is
  // treated fresh, and offer a real recovery path.
  await prisma.contact.update({ where: { id: contact.id }, data: { pendingCheckIn: null, pendingCheckOut: null } });
  const body = "Ah, sorry — that room's actually already booked for those exact dates. Want to try different dates, or see other rooms?";
  await sendAndPersist(
    tenant,
    contact,
    {
      type: "list",
      body,
      buttonText: "Choose",
      sections: [{ rows: [{ id: "dates_retry", title: "Try different dates" }, { id: SEE_OTHER_ROOMS_BUTTON_ID, title: "See other rooms" }] }],
    },
    "Failed to send availability-conflict message"
  );
}

/**
 * Fast path, called synchronously from the webhook route: persists the
 * inbound message and upserts the Contact immediately (so a message is
 * never lost even if the AI pipeline later fails), cancels any follow-ups
 * now made moot by the guest replying, then hands off to the queue for the
 * slower RAG/AI/send work. Idempotent — Meta retries webhook deliveries.
 */
export async function handleInboundMessage(msg: InboundMessage): Promise<void> {
  const tenant = await resolveTenantByPhoneNumberId(msg.phoneNumberId);
  if (!tenant) {
    console.warn(`Inbound WhatsApp message for unknown phone_number_id ${msg.phoneNumberId}`);
    return;
  }

  if (msg.whatsappMessageId) {
    const existing = await prisma.message.findUnique({ where: { whatsappMessageId: msg.whatsappMessageId } });
    if (existing) return;
  }

  const downloaded = msg.mediaId ? await downloadInboundMedia(tenant.id, msg).catch((err) => (console.error(err), null)) : null;

  // Storing to S3 is best-effort (lets the CRM show the original attachment)
  // and deliberately kept separate from transcription below — a broken/
  // unconfigured bucket shouldn't also block Anushka from understanding a
  // voice note, since transcription only needs the bytes, not a stored URL.
  const mediaUrl = downloaded
    ? await uploadObject(tenant.id, "inbound-media", downloaded.buffer, downloaded.contentType, msg.mediaId ?? undefined).catch((err) => {
        console.error(`Failed to store inbound media for tenant ${tenant.id}:`, err);
        return null;
      })
    : null;

  let content = msg.text;
  // What the guest typed alongside a photo or document is a real message —
  // often the whole point ("here's my ID for check-in"). It was being dropped,
  // so the attachment arrived as an empty bubble and Anushka never saw the
  // words.
  //
  // Deliberately NOT falling back to the filename here. Filling `content`
  // with "aadhaar-front.pdf" would have Anushka reply to the filename as if
  // the guest had typed it, and would skip the caption-less media
  // acknowledgement in process-message-job that asks them to say what they
  // need in words. The filename is a label for the CRM, not something the
  // guest said — it rides in mediaFilename and is rendered by the bubble.
  if (!content) content = msg.mediaCaption;
  if (!content && msg.type === "audio" && downloaded) {
    content = await transcribeAudio(downloaded.buffer, downloaded.contentType)
      .then((text) => (text ? `🎤 ${text}` : null))
      .catch((err) => {
        console.error(`Voice note transcription failed for tenant ${tenant.id}:`, err);
        return null;
      });
  }

  // The contact-list preview line. A filename is far more use here than
  // "[document]" — it tells staff at a glance that an ID scan came in.
  const preview = content ?? msg.mediaFilename ?? `[${msg.type}]`;
  const now = new Date();
  const optingOut = isOptOutSignal(msg);

  // Script is a strong, free signal of language, but only worth acting on
  // before a real choice exists — see the `language` field on the update
  // below for why an explicit pick must never be overwritten by it.
  const existingContact = await prisma.contact.findUnique({
    where: { tenantId_whatsappNumber: { tenantId: tenant.id, whatsappNumber: msg.waId } },
    select: { language: true },
  });
  // See resolveContactLanguageUpdate for the rule and why it's a named,
  // tested function rather than an inline condition.
  const contactLanguageUpdate = resolveContactLanguageUpdate(existingContact?.language, content);
  const inferredLanguage = contactLanguageUpdate;

  const contact = await prisma.contact.upsert({
    where: { tenantId_whatsappNumber: { tenantId: tenant.id, whatsappNumber: msg.waId } },
    create: {
      tenantId: tenant.id,
      name: msg.contactName,
      phone: msg.waId,
      whatsappNumber: msg.waId,
      lastInboundAt: now,
      lastMessage: preview,
      // Attribution is set once at creation and never overwritten by later
      // messages — a contact's original source shouldn't drift just because
      // a later message happens to lack a referral block.
      leadSource: msg.referral ? "META_AD" : "DIRECT",
      sourceDetail: msg.referral?.headline ?? null,
      ctwaClid: msg.referral?.ctwaClid ?? null,
      optedOutAt: optingOut ? now : undefined,
      language: inferredLanguage ?? undefined,
    },
    update: {
      name: msg.contactName ?? undefined,
      lastInboundAt: now,
      lastMessage: preview,
      optedOutAt: optingOut ? now : undefined,
      // Inferred from script ONLY while nothing has been chosen — a guest
      // writing in Devanagari or Telugu clearly wants that language, and
      // shouldn't have to find the picker to say so. An explicit pick is
      // never overwritten here: `language: undefined` leaves it untouched,
      // so someone who chose Hindi and then types one Roman-letter word is
      // not silently switched back.
      language: contactLanguageUpdate,
    },
  });

  // Every reply below is rendered in this language — buttons, prompts and
  // deterministic copy alike. Read after the upsert so a language chosen or
  // inferred on THIS turn already applies to this turn's reply.
  const lang = replyLanguage(contact);

  const messageRow = await prisma.message.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      direction: "IN",
      type: mapMessageType(msg.type),
      content: content ?? msg.buttonText,
      interactiveId: msg.interactiveId,
      mediaUrl,
      // Kept even when mediaUrl is set, and essential when it isn't: with no
      // object storage configured, uploadObject returns null and mediaUrl
      // stays empty, which is why a guest's photo previously showed in the CRM
      // as an empty bubble. /api/media/[id] streams it back from Meta using
      // this id instead.
      mediaId: msg.mediaId,
      mediaMimeType: msg.mediaMimeType,
      mediaFilename: msg.mediaFilename,
      whatsappMessageId: msg.whatsappMessageId || null,
      status: "DELIVERED",
    },
  });

  await prisma.scheduledFollowUp.updateMany({
    where: { tenantId: tenant.id, contactId: contact.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  // M6: a reply from a broadcast recipient counts as "replied" for that campaign,
  // regardless of which campaign message they're actually responding to.
  await prisma.campaignRecipient.updateMany({
    where: { contactId: contact.id, status: { in: ["SENT", "DELIVERED", "READ"] } },
    data: { status: "REPLIED" },
  });

  // A "Stop promos" click or a texted STOP is a compliance action, not a
  // conversational turn — handle it directly with a fixed confirmation
  // rather than routing it through the AI pipeline (which might otherwise
  // reply as if the guest just asked a normal question).
  if (optingOut) {
    await sendAndPersist(tenant, contact, { type: "text", text: OPT_OUT_CONFIRMATION }, "Failed to send opt-out confirmation");
    return;
  }

  // "Confirm booking" is a fixed, code-owned button id, never inferred from
  // free text — mirrors the opt-out short-circuit above for the same reason:
  // a booking completion is business-critical and must not depend on a weak
  // fallback model's interpretation of a typed "yes, confirm".
  if (msg.interactiveId === CONFIRM_BOOKING_BUTTON_ID) {
    if (contact.aiPaused) {
      // Staff has taken this conversation over manually — don't auto-complete
      // or auto-reply behind their back, just flag it so they can finish it
      // personally, mirroring how process-message-job.ts fully silences the
      // AI whenever aiPaused is set.
      await fireBookingNotification(
        prisma,
        tenant.id,
        contact.id,
        `${contact.name || contact.phone} tapped "Confirm booking" — AI is paused, needs manual completion.`
      );
      return;
    }

    // Real-time availability gating: today a tap always completed even with
    // zero structured dates ever captured — this is a deliberate tightening.
    // resolveStageKey doesn't gate CONFIRM_BOOKING on dates being known (by
    // design, see interactive-prompts.ts), so this isn't a dead end: once
    // dates get captured, the very next AI turn re-offers Confirm-booking
    // buttons naturally, resolving in one extra tap, not a stuck state.
    if (contact.pendingRoomId && contact.pendingCheckIn && contact.pendingCheckOut) {
      await attemptBookingCompletion(tenant, contact, contact.pendingRoomId, contact.pendingCheckIn, contact.pendingCheckOut);
      return;
    }

    if (!contact.pendingCheckIn || !contact.pendingCheckOut) {
      const body = contact.pendingRoomId
        ? "Just need your dates to lock this in — when are you thinking?"
        : "Let's get your dates sorted first — when are you thinking?";
      await sendAndPersist(tenant, contact, toShortCircuitInteractive(body, dateQuickPickPrompt(lang)), "Failed to send date-quick-pick prompt");
      return;
    }

    // Dates known, room missing — ask them to pick one from the real list,
    // narrowed to what's actually free for those dates.
    const roomsForConfirm = await bookableRooms(tenant.id, contact);
    if (roomsForConfirm.length) {
      await sendAndPersist(
        tenant,
        contact,
        buildRoomListMessage(roomsForConfirm, replyLanguage(contact), true, contact.pendingGuestCount),
        "Failed to send room list"
      );
      return;
    }
    // Dates are known here by definition, so an empty list means genuinely
    // sold out rather than a hotel with no rooms configured.
    const anyRooms = await prisma.room.count({ where: { tenantId: tenant.id } });
    if (anyRooms) {
      await sendAndPersist(
        tenant,
        contact,
        toShortCircuitInteractive("Ah, we're fully booked for those dates 😔 Would another date work for you?", dateQuickPickPrompt(lang)),
        "Failed to send fully-booked message"
      );
      return;
    }

    // No rooms configured at all (shouldn't happen operationally, since
    // reaching CONFIRM_BOOKING requires a prior room recommendation) —
    // complete without room/date fields so the guest still gets a booking.
    const fallbackBooking = await completeBooking(prisma, tenant.id, contact.id);
    const fallbackText = `You're all set! Your booking reference is ${fallbackBooking.referenceCode}. Please pay at the counter when you check in — see you soon! 🎉`;
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(fallbackText, postBookingPrompt(lang)), "Failed to send booking confirmation");
    return;
  }

  // A completed WhatsApp Flow submission (the one-tap booking form — see
  // src/lib/whatsapp/flows/booking-flow.ts) — a Flow's "Book now" tap is the
  // explicit confirmation itself, the same trust level as any other fixed-id
  // button tap, so this completes directly with no extra "are you sure" step.
  if (msg.flowResponse) {
    if (contact.aiPaused) {
      await fireBookingNotification(
        prisma,
        tenant.id,
        contact.id,
        `${contact.name || contact.phone} submitted the booking form — AI is paused, needs manual completion.`
      );
      return;
    }

    const roomId = typeof msg.flowResponse.room === "string" ? msg.flowResponse.room : null;
    const dateRange = parseFlowDateRange(msg.flowResponse.date_range);
    const room = roomId ? await prisma.room.findFirst({ where: { id: roomId, tenantId: tenant.id } }) : null;

    if (room && dateRange) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { pendingRoomId: room.id, pendingCheckIn: dateRange.checkIn, pendingCheckOut: dateRange.checkOut },
      });
      await attemptBookingCompletion(tenant, contact, room.id, dateRange.checkIn, dateRange.checkOut);
      return;
    }
    // Couldn't make sense of the submission (an unexpected field shape, or a
    // stale room id) -- fail soft into the normal AI queue below rather than
    // leaving the guest with silence; Anushka picks up from whatever text
    // content the Flow message carried.
  }

  // A guest asked to try different dates after an availability conflict.
  if (msg.interactiveId === "dates_retry") {
    if (contact.aiPaused) return;
    await sendAndPersist(
      tenant,
      contact,
      toShortCircuitInteractive("No problem — when else works for you?", dateQuickPickPrompt(lang)),
      "Failed to send date-retry prompt"
    );
    return;
  }

  // "Show me offers" — deterministic for the same reason SEE_OTHER_ROOMS_BUTTON_ID
  // is: real active offers from the DB, not a free-tier model relaying them
  // a second time from memory.
  if (msg.interactiveId === SHOW_OFFERS_BUTTON_ID) {
    if (contact.aiPaused) return;

    const offers = await prisma.offer.findMany({ where: { tenantId: tenant.id, active: true } });
    if (offers.length) {
      await sendAndPersist(tenant, contact, buildOfferListMessage(offers, lang), "Failed to send offers list");
      return;
    }
    // No active offers configured — fall through to the AI queue so the
    // guest still gets *some* reply, matching the "no rooms configured" fallback above.
  }

  // Tapping an offer row. The list has always generated these ids and
  // nothing has ever handled them, so the tap fell through to the model
  // carrying only the offer's title as text — a dead end at the exact moment
  // a guest is most interested in booking. Answered from the Offer row so
  // the discount and code are the hotel's real ones, then pointed back at
  // the booking flow rather than left hanging.
  if (msg.interactiveId?.startsWith("offer_pick_")) {
    if (contact.aiPaused) return;
    const offer = await prisma.offer.findFirst({
      where: { id: msg.interactiveId.slice("offer_pick_".length), tenantId: tenant.id, active: true },
    });
    if (offer) {
      const label = offer.title.replace(/\s*\([A-Z0-9_-]{3,}\)\s*$/, "").trim();
      const body = t(lang).offerDetail(label, offer.discount ?? "", offer.code ?? "—");
      // Straight to dates when they're still unknown, so an interested guest
      // moves forward instead of having to restate what they want.
      const prompt = contact.pendingCheckIn && contact.pendingCheckOut ? confirmBookingPrompt(lang) : dateQuickPickPrompt(lang);
      await sendAndPersist(tenant, contact, toShortCircuitInteractive(body, prompt), "Failed to send offer detail");
      return;
    }
    // Stale or deactivated offer — fall through to the AI rather than
    // pretending a discount still exists.
  }

  // A language-select tap (English/हिंदी/తెలుగు) — made fully deterministic
  // after a real live-observed failure: the waterfall correctly forces
  // GREET_MENU buttons right after this tap (see looksLikeLanguageSelection
  // in interactive-prompts.ts), but a weak fallback model can still ignore
  // its predicted-stage instruction and write incongruent free text (e.g.
  // asking about dates) while those GREET_MENU buttons render underneath —
  // a real text/button mismatch this sidesteps entirely, same reasoning as
  // every other zero-ambiguity tap (ROOM_BOOK_BUTTON_ID, etc.) in this file.
  if (msg.interactiveId && LANGUAGE_BUTTON_VALUES[msg.interactiveId]) {
    if (contact.aiPaused) return;
    const chosen = LANGUAGE_BUTTON_VALUES[msg.interactiveId];
    // Persisted, which is the whole fix. Before this the tap produced one
    // localised greeting and nothing else: the choice was never stored, so
    // every later button and every deterministic reply came back in English
    // and the picker was, from the guest's side, decorative.
    await prisma.contact.update({ where: { id: contact.id }, data: { language: chosen } });
    await sendAndPersist(
      tenant,
      contact,
      toShortCircuitInteractive(t(chosen).greetAfterLanguage, greetMenuPrompt(chosen)),
      "Failed to send greet-menu after language select"
    );
    return;
  }

  // GREET_MENU's "Book a room" tap — the highest-intent signal in the whole
  // flow. If this tenant has a published WhatsApp Flow (a real native
  // date-range calendar + room dropdown, see
  // src/lib/whatsapp/flows/booking-flow.ts), send it for a one-tap booking
  // instead of the step-by-step button waterfall. Deliberately narrow entry
  // point for v1 (every other path is unchanged) and fully resilient: no
  // Flow configured, or the send itself fails (e.g. not yet approved by
  // Meta) both fall straight through to today's normal behavior below —
  // this can never leave a guest stuck.
  if (msg.interactiveId === "greet_book") {
    if (contact.aiPaused) return;

    const profile = await prisma.hotelProfile.findUnique({ where: { tenantId: tenant.id } });
    if (profile?.whatsappBookingFlowId) {
      try {
        await sendAndPersist(
          tenant,
          contact,
          {
            type: "flow",
            body: "Let's get you booked — pick a room and your dates:",
            flowId: profile.whatsappBookingFlowId,
            flowCta: "Book now",
            screen: "BOOKING",
          },
          "Failed to send booking flow"
        );
        return;
      } catch (err) {
        console.error(`Booking flow send failed for tenant ${tenant.id}, contact ${contact.id} — falling back to normal flow:`, err);
      }
    }
    // No Flow configured for this tenant, or the send failed -- fall
    // through to the normal AI queue below, exactly as today.
  }

  // GREET_MENU's "Ask a question" tap: show the tenant's real FAQ questions
  // as a list instead of free-texting through the AI — a guest taps a real
  // question and gets a guaranteed-accurate stored answer next (see the
  // faq_pick_ handler below).
  if (msg.interactiveId === GREET_QUESTION_BUTTON_ID) {
    if (contact.aiPaused) return;

    const [faqs, locProfile] = await Promise.all([
      prisma.faq.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } }),
      prisma.hotelProfile.findUnique({ where: { tenantId: tenant.id }, select: { lat: true, lng: true, contactPhone: true } }),
    ]);
    // Only offered when there is a pin to send — a row promising directions
    // that then sends nothing is worse than no row at all.
    const locationRow =
      locProfile?.lat != null && locProfile?.lng != null
        ? { row: t(lang).locationRow, description: t(lang).locationRowDesc }
        : null;
    // Only offered when there is a number to give. A "Call us" row that then
    // has no number is worse than no row.
    const callRow = locProfile?.contactPhone?.trim()
      ? { row: t(lang).callRow, description: t(lang).callRowDesc }
      : null;
    if (faqs.length || locationRow || callRow) {
      await sendAndPersist(tenant, contact, buildFaqListMessage(faqs, locationRow, callRow), "Failed to send FAQ list");
      return;
    }
    // No FAQs configured — fall through to the AI queue.
  }

  // "Where are you?" — a real map pin, not a link.
  //
  // A Google Maps URL costs the guest a browser, a consent screen and a
  // hand-off to their map app. A WhatsApp location message opens straight in
  // whatever maps app they already have, with a Directions button, without
  // leaving the chat. The pin comes from HotelProfile.lat/lng, which the owner
  // sets by pasting their Maps link into Settings.
  if (msg.interactiveId === SHOW_LOCATION_BUTTON_ID) {
    if (contact.aiPaused) return;

    const profile = await prisma.hotelProfile.findUnique({ where: { tenantId: tenant.id } });
    if (profile?.lat != null && profile?.lng != null) {
      await sendAndPersist(
        tenant,
        contact,
        {
          type: "location",
          latitude: profile.lat,
          longitude: profile.lng,
          name: profile.name,
          address: profile.address ?? undefined,
        },
        "Failed to send hotel location"
      );
      // The caption goes second so the pin is what they see first.
      await sendAndPersist(tenant, contact, { type: "text", text: t(lang).locationCaption }, "Failed to send location caption");
      return;
    }
    // No coordinates set for this hotel — fall through to the AI, which still
    // has the address and the maps link in its prompt.
  }

  // "Call us" — the number as plain text, which WhatsApp turns into a tappable
  // link that opens the dialer. A cta_url button cannot do this: those only
  // accept http(s), so a tel: link there is silently dropped.
  if (msg.interactiveId === CALL_US_BUTTON_ID) {
    if (contact.aiPaused) return;

    const profile = await prisma.hotelProfile.findUnique({
      where: { tenantId: tenant.id },
      select: { contactPhone: true },
    });
    const phone = profile?.contactPhone?.trim();
    if (phone) {
      await sendAndPersist(tenant, contact, { type: "text", text: t(lang).callBody(phone) }, "Failed to send phone number");
      return;
    }
    // No number configured — fall through to the AI, which can still help.
  }

  // "Group / corporate" on the party-size question.
  //
  // Deliberately does NOT continue the normal funnel. A block of rooms is a
  // different sale: rates get negotiated, the rooms have to be held together,
  // and there is usually an invoice — none of which the assistant may decide.
  // So it asks the one question that shapes the request and then hands over.
  if (msg.interactiveId === GROUP_BOOKING_BUTTON_ID) {
    if (contact.aiPaused) return;

    await sendAndPersist(
      tenant,
      contact,
      toShortCircuitInteractive(t(lang).groupRoomsBody, groupRoomsPrompt(lang)),
      "Failed to send group room-count prompt"
    );
    return;
  }

  // How many rooms the group needs — the last thing the assistant asks before
  // a person takes over.
  if (msg.interactiveId && (GROUP_ROOM_BUTTON_IDS as readonly string[]).includes(msg.interactiveId)) {
    if (contact.aiPaused) return;

    const s = t(lang);
    const rooms =
      msg.interactiveId === "group_rooms_3_5" ? s.rooms3to5 : msg.interactiveId === "group_rooms_6_10" ? s.rooms6to10 : s.rooms10plus;

    await sendAndPersist(tenant, contact, { type: "text", text: s.groupHandover(rooms) }, "Failed to send group handover");

    // Handed to reception for real, not just promised. takeOverFields sets
    // aiPaused too, so the assistant stops rather than negotiating underneath
    // whoever picks this up — see lib/crm/handover.ts.
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        leadStatus: "INTERESTED",
        // Stored as its own field so the CRM can filter on it without parsing
        // the handover sentence, which is written in the guest's language.
        groupRooms: rooms,
        ...takeOverFields(`Group booking — ${rooms}`),
        aiBriefing: `Corporate/group enquiry: ${rooms}. Dates and company name not yet captured.`,
      },
    });

    await prisma.staffNotification
      .create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          type: "ESCALATION",
          reason: `Group booking enquiry from ${contact.name || contact.phone} — ${rooms}.`,
        },
      })
      .catch((err) => console.error("Failed to flag group booking:", err));
    return;
  }

  // A tap on a specific FAQ row — send the real stored answer directly, zero
  // AI/hallucination risk, same reasoning as SEE_OTHER_ROOMS_BUTTON_ID.
  if (msg.interactiveId?.startsWith("faq_pick_")) {
    if (contact.aiPaused) return;

    const faqId = msg.interactiveId.slice("faq_pick_".length);
    const faq = await prisma.faq.findFirst({ where: { id: faqId, tenantId: tenant.id } });
    if (faq) {
      await sendAndPersist(tenant, contact, { type: "text", text: faq.answer }, "Failed to send FAQ answer");
      return;
    }
    // Not found (stale/cross-tenant id) — fall through to the AI queue.
  }

  // "See other options" is handled deterministically too — not because it's
  // business-critical like the two blocks above, but because trusting a
  // free-tier model to relay real room names/prices in prose a second time
  // is exactly the kind of thing that goes wrong (a genuine, live-observed
  // failure mode of the weaker models in the fallback chain); a real DB
  // query can't hallucinate a price.
  if (msg.interactiveId === SEE_OTHER_ROOMS_BUTTON_ID) {
    if (contact.aiPaused) return; // staff has taken over — stay fully silent, same rule the AI queue follows

    const rooms = await bookableRooms(tenant.id, contact);
    if (rooms.length) {
      // This row is also the greeting menu's "Availability & price", which a
      // guest can tap before mentioning any date at all — so the copy has to
      // stop claiming an availability check that never ran.
      const datesKnown = Boolean(contact.pendingCheckIn && contact.pendingCheckOut);
      await sendAndPersist(
        tenant,
        contact,
        buildRoomListMessage(rooms, replyLanguage(contact), datesKnown, contact.pendingGuestCount),
        "Failed to send room list"
      );
      return;
    }
    // Everything is booked for the dates they've settled on -- say so and
    // reopen dates, rather than sending an empty list or (worse) letting
    // them keep negotiating for a room that can't be given to them.
    if (contact.pendingCheckIn && contact.pendingCheckOut) {
      await sendAndPersist(
        tenant,
        contact,
        toShortCircuitInteractive("Ah, we're fully booked for those dates 😔 Would another date work for you?", dateQuickPickPrompt(lang)),
        "Failed to send fully-booked message"
      );
      return;
    }
    // No rooms configured for this tenant (shouldn't happen operationally,
    // since reaching RECOMMEND requires at least one) — fall through to the
    // normal AI queue below so the guest still gets *some* reply.
  }

  // A tap on one specific room from the "See other options"/"View rooms"
  // list. Previously this silently fell through to the AI as plain
  // room-name text (a real pre-existing gap) — trusting a free-tier model
  // to relay that same room's name/price a second time is exactly the
  // failure mode SEE_OTHER_ROOMS_BUTTON_ID is already deterministic to
  // avoid. Also the most reliable capture point for real-time availability
  // checking's pendingRoomId (see room-match.ts for the free-text fallback).
  if (msg.interactiveId?.startsWith("room_pick_")) {
    if (contact.aiPaused) return;

    const roomId = msg.interactiveId.slice("room_pick_".length);
    const room = await prisma.room.findFirst({ where: { id: roomId, tenantId: tenant.id } });
    if (room) {
      // The lists this tap comes from are already filtered by availability,
      // but a list sent BEFORE the guest settled their dates stays tappable
      // in their chat history indefinitely — so the room is re-checked at
      // the moment of the tap rather than trusting how the list looked when
      // it was sent. Without this, the stale-list path walks the guest right
      // back into committing to a room that's gone.
      const free =
        !contact.pendingCheckIn || !contact.pendingCheckOut
          ? true
          : await isRoomAvailable(prisma, tenant.id, room.id, contact.pendingCheckIn, contact.pendingCheckOut).catch(() => true);
      if (!free) {
        await sendAndPersist(
          tenant,
          contact,
          toShortCircuitInteractive(
            `Ah — the ${room.name} is already booked for those dates 😔 Want to see what else we have free, or try different dates?`,
            dateQuickPickPrompt(lang)
          ),
          "Failed to send room-unavailable message"
        );
        return;
      }
      await prisma.contact.update({ where: { id: contact.id }, data: { pendingRoomId: room.id } });
      const body = `${room.name} — from ₹${room.price}/night. Want to go ahead with this one?`;
      await sendAndPersist(tenant, contact, toShortCircuitInteractive(body, roomResponsePrompt(lang)), "Failed to send room-pick response");
      return;
    }
    // Not found (stale/cross-tenant id) — fall through to the AI queue.
  }

  // "Book this room" is deterministic too — zero ambiguity in what it means
  // (move to CLOSE), so there's nothing for the AI to interpret. Live
  // testing found a real failure mode when this was left to the AI: it
  // sometimes fabricated a phone number and told the guest to call
  // reception instead of using the established button flow at all.
  if (msg.interactiveId === ROOM_BOOK_BUTTON_ID) {
    if (contact.aiPaused) return; // staff has taken over — stay fully silent, same rule the AI queue follows

    // Ask for dates BEFORE offering to confirm.
    //
    // Seen in a real chat: a guest reached "Book this room" without ever
    // giving dates, was asked "Ready to confirm your booking? 🎉", tapped
    // Confirm — and got "Just need your dates to lock this in." Offering a
    // confirmation that cannot be honoured, then walking it back, is worse
    // than asking one turn earlier: the guest has already decided, and the
    // reversal reads as the assistant not knowing its own state.
    if (!contact.pendingCheckIn || !contact.pendingCheckOut) {
      await sendAndPersist(
        tenant,
        contact,
        toShortCircuitInteractive(t(lang).datesBody, dateQuickPickPrompt(lang)),
        "Failed to send dates prompt before confirm"
      );
      return;
    }

    const body = "Great choice! Ready to confirm your booking? 🎉";
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(body, confirmBookingPrompt(lang)), "Failed to send confirm-booking prompt");
    return;
  }

  // DATE_QUICK_PICK taps ("Today"/"Tomorrow"/"This weekend"/"Next week") —
  // unlike the short-circuits above, this doesn't return: Anushka still
  // needs to compose a natural next line (move to guest count, or on to
  // confirming), so real dates are resolved deterministically in code (100%
  // reliable, unlike trusting the AI to interpret "This weekend" itself),
  // persisted, and the guest's own message content is rewritten to the
  // human-readable resolved label before falling through to the normal AI
  // queue below — so Anushka's reply is grounded in the real date, not the
  // vague phrase.
  // The vague rows open the date picker instead of resolving to a guess.
  //
  // Reported live twice. First "Next week" set a stay of 24-25 Aug — a
  // specific night nobody chose, out of seven possible days. Then "This
  // weekend" did the same thing one step faster: it picked Sat-Sun on the
  // guest's behalf and went straight to the room list, so the first time
  // dates were ever mentioned back to them was inside a booking.
  //
  // "This weekend" looks more precise than it is. It assumes which weekend,
  // that the stay is Saturday to Sunday, and that it is one night — a guest
  // arriving Friday for two nights would have all three wrong and no chance
  // to say so.
  //
  // The picker asks the arrival day and then the number of nights, so
  // check-in AND check-out both come from the guest. Today and Tomorrow still
  // resolve directly: those name exactly one day, so there is nothing to ask.
  if (msg.interactiveId === "dates_weekend" || msg.interactiveId === "dates_nextweek") {
    if (contact.aiPaused) return;
    await sendAndPersist(tenant, contact, buildCheckInPickerMessage(new Date(), lang), "Failed to send date picker");
    return;
  }

  if (msg.interactiveId === "dates_today" || msg.interactiveId === "dates_tomorrow") {
    const { checkIn, checkOut, label } = resolveQuickPickDates(msg.interactiveId);
    await prisma.contact.update({ where: { id: contact.id }, data: { pendingCheckIn: checkIn, pendingCheckOut: checkOut } });
    await prisma.message.update({ where: { id: messageRow.id }, data: { content: label } });
  }

  // ---- The tappable calendar ----
  // "I'll type dates"/"Another date" used to be a dead end: it fell through
  // to the AI as free text, so the guest who wanted a specific date got
  // prose instead of anything to tap. It now opens a real date picker built
  // from List Messages. This is the same experience the native in-WhatsApp
  // CalendarPicker gives, without depending on a published Flow -- Flow
  // publishing is gated behind Meta's per-number integrity check (verified
  // live: create and upload succeed, publish returns 139000/4233020 while
  // the display name sits DECLINED), which every hotel would hit before its
  // guests could pick a date. See date-picker-message.ts.
  // ---- Managing a booking the guest already has ----
  // Cancel/reschedule used to be recognised only in the negative: enough to
  // stop it being hijacked into a NEW booking funnel, after which it fell to
  // the model, which can only escalate. Every completed booking was a future
  // support call. Handled deterministically for the same reason the confirm
  // tap is — cancelling someone's stay must not depend on a free-tier
  // model's reading of "cancel my booking".
  if (msg.interactiveId === CANCEL_BOOKING_ID || msg.interactiveId === CHANGE_DATES_ID || msg.interactiveId === KEEP_BOOKING_ID) {
    if (contact.aiPaused) return;
    const booking = await findActiveBooking(prisma, tenant.id, contact.id);
    if (!booking) {
      await sendAndPersist(tenant, contact, { type: "text", text: t(lang).noBookingFound }, "Failed to send no-booking message");
      return;
    }
    if (msg.interactiveId === KEEP_BOOKING_ID) {
      await sendAndPersist(tenant, contact, { type: "text", text: t(lang).bookingKept(booking.referenceCode) }, "Failed to send keep-booking message");
      return;
    }
    if (msg.interactiveId === CANCEL_BOOKING_ID) {
      await cancelBooking(prisma, tenant.id, contact.id, booking.id);
      await fireBookingNotification(prisma, tenant.id, contact.id, `${contact.name || contact.phone} cancelled booking ${booking.referenceCode} via WhatsApp.`);
      await sendAndPersist(tenant, contact, { type: "text", text: t(lang).bookingCancelled(booking.referenceCode) }, "Failed to send cancellation");
      return;
    }
    // Change dates: the old booking is released first so the guest isn't
    // competing with themselves for the room they're trying to move.
    await beginReschedule(prisma, tenant.id, contact.id, booking);
    await fireBookingNotification(prisma, tenant.id, contact.id, `${contact.name || contact.phone} is rescheduling booking ${booking.referenceCode} via WhatsApp.`);
    await sendAndPersist(
      tenant,
      contact,
      toShortCircuitInteractive(t(lang).rescheduleStart, dateQuickPickPrompt(lang)),
      "Failed to send reschedule prompt"
    );
    return;
  }

  // A typed "cancel my booking" / "can I reschedule?" — show them the real
  // booking with real options rather than escalating.
  if (!msg.interactiveId && content && looksLikeExistingBookingRequest(content)) {
    if (contact.aiPaused) return;
    const booking = await findActiveBooking(prisma, tenant.id, contact.id);
    if (booking) {
      const dates =
        booking.checkIn && booking.checkOut ? describeStay(booking.checkIn, booking.checkOut) : "dates not set";
      await sendAndPersist(
        tenant,
        contact,
        {
          type: "list",
          body: t(lang).manageBookingBody(booking.referenceCode, booking.roomNameSnapshot ?? "your room", dates),
          buttonText: t(lang).manageBookingButton,
          sections: [
            {
              rows: [
                { id: CHANGE_DATES_ID, title: t(lang).manageChangeDates },
                { id: CANCEL_BOOKING_ID, title: t(lang).manageCancel },
                { id: KEEP_BOOKING_ID, title: t(lang).manageKeep },
              ],
            },
          ],
        },
        "Failed to send manage-booking options"
      );
      return;
    }
    // No booking on this number — say so plainly instead of pretending.
    await sendAndPersist(tenant, contact, { type: "text", text: t(lang).noBookingFound }, "Failed to send no-booking message");
    return;
  }

  // PRICE_OBJECTION's "Continue anyway" — the guest accepting the room at
  // its price. Previously fell through as bare label text; now it moves
  // straight to the close, which is what the tap means.
  if (msg.interactiveId === "continue_anyway") {
    if (contact.aiPaused) return;
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(t(lang).continueAnyway, confirmBookingPrompt(lang)), "Failed to send continue-anyway");
    return;
  }

  // POST_BOOKING's two rows. Both are fixed acknowledgements, and neither
  // continues the sale — which is why they deliberately run even while the
  // chat is paused or handed to reception.
  //
  // That exemption exists because of a regression these probes caught:
  // completing a booking now hands the conversation to a person (see
  // lib/crm/handover.ts), which sets aiPaused — so the buttons attached to the
  // confirmation message itself both fell through the aiPaused guard and sent
  // absolutely nothing. A guest tapped the only two options they were given
  // and the hotel went silent, one second after taking their booking.
  //
  // The aiPaused guard is there to stop the ASSISTANT talking over a human.
  // A canned "type your question, our team will reply" is not that.
  if (msg.interactiveId === "post_booking_question") {
    await sendAndPersist(
      tenant,
      contact,
      { type: "text", text: t(lang).postBookingQuestionAck },
      "Failed to send post-booking acknowledgement"
    );
    // Flagged so it lands in the CRM's attention list rather than relying on
    // someone noticing an unread row. The promise above is only true if a
    // person actually sees it.
    await prisma.staffNotification
      .create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          type: "ESCALATION",
          reason: `${contact.name || contact.phone} has a question about their booking.`,
        },
      })
      .catch((err) => console.error("Failed to flag post-booking question:", err));
    return;
  }

  if (msg.interactiveId === "post_booking_done") {
    await sendAndPersist(tenant, contact, { type: "text", text: t(lang).farewell }, "Failed to send farewell");
    return;
  }

  // Every date-picker tap routes through one pure decision function, which
  // is what makes the "no row may re-open its own list" invariant testable
  // exhaustively — see date-picker-router.ts for the loop this prevents.
  const pickerAction = routeDatePickerTap(msg.interactiveId, { pendingCheckIn: contact.pendingCheckIn });
  if (pickerAction.kind !== "notMine") {
    if (contact.aiPaused) return;

    if (pickerAction.kind === "openCheckInPicker") {
      await sendAndPersist(tenant, contact, buildCheckInPickerMessage(new Date(), lang), "Failed to send date picker");
      return;
    }

    if (pickerAction.kind === "prompt") {
      // Prose, no list attached — structurally cannot loop.
      await sendAndPersist(tenant, contact, { type: "text", text: pickerAction.text }, "Failed to send date prompt");
      return;
    }

    if (pickerAction.kind === "setCheckIn") {
      // Check-out is deliberately cleared: a half-set range left over from
      // an earlier attempt would otherwise pair a new arrival with a stale
      // departure, which is how a check-out lands before its check-in.
      await prisma.contact.update({
        where: { id: contact.id },
        data: { pendingCheckIn: pickerAction.checkIn, pendingCheckOut: null },
      });
      await sendAndPersist(tenant, contact, buildNightsPickerMessage(pickerAction.checkIn, lang), "Failed to send nights picker");
      return;
    }

    if (pickerAction.kind === "setCheckOut" && contact.pendingCheckIn) {
      await prisma.contact.update({ where: { id: contact.id }, data: { pendingCheckOut: pickerAction.checkOut } });

      // Say the dates back before any room appears.
      //
      // Reported live: the message straight after a date choice was the room
      // list, so the first time a guest saw their actual stay it was already
      // inside a booking. One line naming the range and the hotel's own
      // check-in/check-out times gives them a chance to correct it first.
      const stayProfile = await prisma.hotelProfile.findUnique({
        where: { tenantId: tenant.id },
        select: { checkInTime: true, checkOutTime: true },
      });
      await sendAndPersist(
        tenant,
        contact,
        {
          type: "text",
          text: t(lang).stayConfirmed(
            describeStay(contact.pendingCheckIn, pickerAction.checkOut),
            stayProfile?.checkInTime ?? null,
            stayProfile?.checkOutTime ?? null
          ),
        },
        "Failed to send stay confirmation"
      );
      // Rewritten to the resolved range for the same reason the quick-pick
      // rows are: Anushka's next reply is then grounded in real dates rather
      // than the phrase "3 nights". Falls through to the AI queue, which now
      // has real dates and can recommend a room it can actually deliver.
      await prisma.message.update({
        where: { id: messageRow.id },
        data: { content: describeStay(contact.pendingCheckIn, pickerAction.checkOut) },
      });
    }
  }

  // ---- The guest names the room they actually want ----
  // Caught in a real booking: after a Classic Room recommendation the guest
  // said "No I only want premium room" and was pushed to confirm — and then
  // booked into — the Classic. Two things were wrong: the rejection didn't
  // stop the close (fixed in resolveStageKey), and the room they DID name
  // was never acted on.
  //
  // Handled deterministically rather than left to the model, for the same
  // reason room-picker taps already are: which room a guest is buying is
  // business-critical and must not depend on a free-tier model reading a
  // negation correctly. Requires an objection/preference signal too, so a
  // genuine question ("is the Premium Room quieter?") is still answered
  // rather than being silently converted into a room switch.
  if (!msg.interactiveId && content && looksLikeRoomObjection(content) && !content.trim().endsWith("?")) {
    const allRooms = await prisma.room.findMany({ where: { tenantId: tenant.id }, orderBy: { price: "asc" } });
    const namedRoomId = matchRecommendedRoom(content, allRooms);
    const named = namedRoomId ? allRooms.find((r) => r.id === namedRoomId) : null;
    if (named && named.id !== contact.pendingRoomId) {
      if (contact.aiPaused) return;
      const free =
        contact.pendingCheckIn && contact.pendingCheckOut
          ? await isRoomAvailable(prisma, tenant.id, named.id, contact.pendingCheckIn, contact.pendingCheckOut).catch(() => true)
          : true;
      if (!free) {
        await sendAndPersist(
          tenant,
          contact,
          toShortCircuitInteractive(
            `Sorry — the ${named.name} is already booked for those dates 😔 Want to try different dates, or see what else is free?`,
            dateQuickPickPrompt(lang)
          ),
          "Failed to send named-room-unavailable message"
        );
        return;
      }
      await prisma.contact.update({ where: { id: contact.id }, data: { pendingRoomId: named.id } });
      await sendAndPersist(
        tenant,
        contact,
        toShortCircuitInteractive(
          `Of course — the ${named.name}, from ₹${named.price}/night, sleeps up to ${named.capacity}. Shall I lock it in?`,
          roomResponsePrompt(lang)
        ),
        "Failed to send named-room switch"
      );
      return;
    }
  }

  // A stay length typed in free text, once "Longer stay" has sent the guest
  // there ("10 nights", "2 raat", "a week", or a bare "10" right after being
  // asked). Without this the escape hatch leads nowhere understandable and
  // the guest is back in the prose loop the picker exists to avoid. Only
  // fills the gap — never overrides a check-out already chosen.
  if (!msg.interactiveId && content && contact.pendingCheckIn && !contact.pendingCheckOut) {
    const lastOut = await prisma.message.findFirst({
      where: { tenantId: tenant.id, contactId: contact.id, direction: "OUT" },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    const nights = parseNightsFromText(content, {
      answeringNightsQuestion: /how many nights/i.test(lastOut?.content ?? ""),
    });
    if (nights) {
      const checkOut = checkOutAfterNights(contact.pendingCheckIn, nights);
      await prisma.contact.update({ where: { id: contact.id }, data: { pendingCheckOut: checkOut } });
      await prisma.message.update({
        where: { id: messageRow.id },
        data: { content: describeStay(contact.pendingCheckIn, checkOut) },
      });
    }
  }

  // The guest-count equivalent of the quick-pick block above: resolve the
  // tap from its stable row id rather than leaving the worker to parse the
  // party size back out of the row's title text. Storing it here means it
  // survives the AI pipeline's 12-message history window, which is what
  // actually caused guests to be asked their party size a second and third
  // time deep in a conversation (see src/lib/booking/guest-count.ts).
  const tappedGuestCount = msg.interactiveId ? GUEST_COUNT_BUTTON_VALUES[msg.interactiveId] : undefined;
  if (tappedGuestCount != null) {
    await prisma.contact.update({ where: { id: contact.id }, data: { pendingGuestCount: tappedGuestCount } });
  }

  // jobId keyed to the inbound message: if this same message is ever
  // enqueued twice (e.g. a Meta webhook retry that got past the
  // whatsappMessageId dedup check above via a race), BullMQ treats a
  // duplicate jobId as a no-op instead of processing it a second time.
  await messageQueue.add(
    "process",
    { tenantId: tenant.id, contactId: contact.id, messageId: messageRow.id },
    { jobId: messageRow.id }
  );
}

function mapStatus(status: StatusUpdate["status"]): MessageStatus {
  switch (status) {
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "READ";
    case "failed":
      return "FAILED";
  }
}

/** Delivery/read receipts for messages we sent. */
export async function handleStatusUpdate(status: StatusUpdate): Promise<void> {
  if (!status.whatsappMessageId) return;
  await prisma.message.updateMany({
    where: { whatsappMessageId: status.whatsappMessageId },
    data: {
      status: mapStatus(status.status),
      // Only written on failure, and only when Meta actually said why — a
      // later delivered/read update for the same message must not wipe a
      // reason, and a failure with no errors[] must not blank an existing one.
      ...(status.status === "failed" && status.errorCode !== null ? { errorCode: status.errorCode } : {}),
      ...(status.status === "failed" && status.errorTitle ? { errorTitle: status.errorTitle } : {}),
    },
  });
}
