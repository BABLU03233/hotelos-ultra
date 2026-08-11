import { MessageStatus, MessageType } from "@/generated/prisma/enums";
import {
  CONFIRM_BOOKING_BUTTON_ID,
  GREET_QUESTION_BUTTON_ID,
  GUEST_COUNT_BUTTON_VALUES,
  InteractivePrompt,
  ROOM_BOOK_BUTTON_ID,
  SEE_OTHER_ROOMS_BUTTON_ID,
  SHOW_OFFERS_BUTTON_ID,
  confirmBookingPrompt,
  dateQuickPickPrompt,
  greetMenuPrompt,
  postBookingPrompt,
  roomResponsePrompt,
} from "@/lib/ai/interactive-prompts";
import { transcribeAudio } from "@/lib/ai/transcription";
import { isRoomAvailable } from "@/lib/booking/availability";
import { completeBooking } from "@/lib/booking/complete-booking";
import { matchOfferCode } from "@/lib/booking/offer-match";
import { parseFlowDateRange } from "@/lib/booking/parse-flow-response";
import { resolveQuickPickDates } from "@/lib/booking/quick-pick-dates";
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
        type: message.type === "text" ? "TEXT" : "INTERACTIVE",
        content: message.type === "text" ? message.text : message.body,
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
  contact: { id: string; name: string | null; phone: string; whatsappNumber: string },
  roomId: string,
  checkIn: Date,
  checkOut: Date
): Promise<void> {
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
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(confirmationText, postBookingPrompt()), "Failed to send booking confirmation");
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
  if (!content && msg.type === "audio" && downloaded) {
    content = await transcribeAudio(downloaded.buffer, downloaded.contentType)
      .then((text) => (text ? `🎤 ${text}` : null))
      .catch((err) => {
        console.error(`Voice note transcription failed for tenant ${tenant.id}:`, err);
        return null;
      });
  }

  const preview = content ?? `[${msg.type}]`;
  const now = new Date();
  const optingOut = isOptOutSignal(msg);

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
    },
    update: {
      name: msg.contactName ?? undefined,
      lastInboundAt: now,
      lastMessage: preview,
      optedOutAt: optingOut ? now : undefined,
    },
  });

  const messageRow = await prisma.message.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      direction: "IN",
      type: mapMessageType(msg.type),
      content: content ?? msg.buttonText,
      interactiveId: msg.interactiveId,
      mediaUrl,
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
      await sendAndPersist(tenant, contact, toShortCircuitInteractive(body, dateQuickPickPrompt()), "Failed to send date-quick-pick prompt");
      return;
    }

    // Dates known, room missing — ask them to pick one from the real list.
    const roomsForConfirm = await prisma.room.findMany({ where: { tenantId: tenant.id }, orderBy: { price: "asc" } });
    if (roomsForConfirm.length) {
      await sendAndPersist(tenant, contact, buildRoomListMessage(roomsForConfirm), "Failed to send room list");
      return;
    }

    // No rooms configured at all (shouldn't happen operationally, since
    // reaching CONFIRM_BOOKING requires a prior room recommendation) —
    // complete without room/date fields so the guest still gets a booking.
    const fallbackBooking = await completeBooking(prisma, tenant.id, contact.id);
    const fallbackText = `You're all set! Your booking reference is ${fallbackBooking.referenceCode}. Please pay at the counter when you check in — see you soon! 🎉`;
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(fallbackText, postBookingPrompt()), "Failed to send booking confirmation");
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
      toShortCircuitInteractive("No problem — when else works for you?", dateQuickPickPrompt()),
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
      await sendAndPersist(tenant, contact, buildOfferListMessage(offers), "Failed to send offers list");
      return;
    }
    // No active offers configured — fall through to the AI queue so the
    // guest still gets *some* reply, matching the "no rooms configured" fallback above.
  }

  // A language-select tap (English/हिंदी/తెలుగు) — made fully deterministic
  // after a real live-observed failure: the waterfall correctly forces
  // GREET_MENU buttons right after this tap (see looksLikeLanguageSelection
  // in interactive-prompts.ts), but a weak fallback model can still ignore
  // its predicted-stage instruction and write incongruent free text (e.g.
  // asking about dates) while those GREET_MENU buttons render underneath —
  // a real text/button mismatch this sidesteps entirely, same reasoning as
  // every other zero-ambiguity tap (ROOM_BOOK_BUTTON_ID, etc.) in this file.
  if (msg.interactiveId === "lang_en" || msg.interactiveId === "lang_hi" || msg.interactiveId === "lang_te") {
    if (contact.aiPaused) return;

    const greetings: Record<string, string> = {
      lang_en: "Great! How can I help you today? 😊",
      lang_hi: "Bilkul! Aaj main aapki kaise madad karoon? 😊",
      lang_te: "Sare! Ivvala meeku ela help cheyagalanu? 😊",
    };
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(greetings[msg.interactiveId], greetMenuPrompt()), "Failed to send greet-menu after language select");
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

    const faqs = await prisma.faq.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
    if (faqs.length) {
      await sendAndPersist(tenant, contact, buildFaqListMessage(faqs), "Failed to send FAQ list");
      return;
    }
    // No FAQs configured — fall through to the AI queue.
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

    const rooms = await prisma.room.findMany({ where: { tenantId: tenant.id }, orderBy: { price: "asc" } });
    if (rooms.length) {
      await sendAndPersist(tenant, contact, buildRoomListMessage(rooms), "Failed to send room list");
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
      await prisma.contact.update({ where: { id: contact.id }, data: { pendingRoomId: room.id } });
      const body = `${room.name} — from ₹${room.price}/night. Want to go ahead with this one?`;
      await sendAndPersist(tenant, contact, toShortCircuitInteractive(body, roomResponsePrompt()), "Failed to send room-pick response");
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

    const body = "Great choice! Ready to confirm your booking? 🎉";
    await sendAndPersist(tenant, contact, toShortCircuitInteractive(body, confirmBookingPrompt()), "Failed to send confirm-booking prompt");
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
  if (
    msg.interactiveId === "dates_today" ||
    msg.interactiveId === "dates_tomorrow" ||
    msg.interactiveId === "dates_weekend" ||
    msg.interactiveId === "dates_nextweek"
  ) {
    const { checkIn, checkOut, label } = resolveQuickPickDates(msg.interactiveId);
    await prisma.contact.update({ where: { id: contact.id }, data: { pendingCheckIn: checkIn, pendingCheckOut: checkOut } });
    await prisma.message.update({ where: { id: messageRow.id }, data: { content: label } });
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
    data: { status: mapStatus(status.status) },
  });
}
