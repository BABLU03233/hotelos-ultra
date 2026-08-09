import { MessageStatus, MessageType } from "@/generated/prisma/enums";
import { CONFIRM_BOOKING_BUTTON_ID, ROOM_BOOK_BUTTON_ID, SEE_OTHER_ROOMS_BUTTON_ID, confirmBookingPrompt } from "@/lib/ai/interactive-prompts";
import { transcribeAudio } from "@/lib/ai/transcription";
import { completeBooking } from "@/lib/booking/complete-booking";
import { fireBookingNotification } from "@/lib/contacts/fire-booking-notification";
import { messageQueue } from "@/lib/queue/queues";
import { prisma } from "@/lib/prisma";
import { downloadMedia, getMediaUrl, sendWhatsAppMessage } from "@/lib/whatsapp/client";
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
    const creds = await getWhatsAppCredentials(tenant.id);
    if (creds) {
      try {
        const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, {
          type: "text",
          text: OPT_OUT_CONFIRMATION,
        });
        await prisma.message.create({
          data: {
            tenantId: tenant.id,
            contactId: contact.id,
            direction: "OUT",
            type: "TEXT",
            content: OPT_OUT_CONFIRMATION,
            whatsappMessageId,
            status: "SENT",
          },
        });
      } catch (err) {
        console.error(`Failed to send opt-out confirmation for tenant ${tenant.id}, contact ${contact.id}:`, err);
      }
    }
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

    const booking = await completeBooking(prisma, tenant.id, contact.id);
    const confirmationText = `You're all set! Your booking reference is ${booking.referenceCode}. Please pay at the counter when you check in — see you soon! 🎉`;
    const creds = await getWhatsAppCredentials(tenant.id);
    if (creds) {
      try {
        const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text: confirmationText });
        await prisma.message.create({
          data: {
            tenantId: tenant.id,
            contactId: contact.id,
            direction: "OUT",
            type: "TEXT",
            content: confirmationText,
            whatsappMessageId,
            status: "SENT",
          },
        });
      } catch (err) {
        console.error(`Failed to send booking confirmation for tenant ${tenant.id}, contact ${contact.id}:`, err);
      }
    }
    return;
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
      const creds = await getWhatsAppCredentials(tenant.id);
      if (creds) {
        try {
          const listMessage = buildRoomListMessage(rooms);
          const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, listMessage);
          await prisma.message.create({
            data: {
              tenantId: tenant.id,
              contactId: contact.id,
              direction: "OUT",
              type: "INTERACTIVE",
              content: listMessage.body,
              whatsappMessageId,
              status: "SENT",
            },
          });
        } catch (err) {
          console.error(`Failed to send room list for tenant ${tenant.id}, contact ${contact.id}:`, err);
        }
      }
      return;
    }
    // No rooms configured for this tenant (shouldn't happen operationally,
    // since reaching RECOMMEND requires at least one) — fall through to the
    // normal AI queue below so the guest still gets *some* reply.
  }

  // "Book this room" is deterministic too — zero ambiguity in what it means
  // (move to CLOSE), so there's nothing for the AI to interpret. Live
  // testing found a real failure mode when this was left to the AI: it
  // sometimes fabricated a phone number and told the guest to call
  // reception instead of using the established button flow at all.
  if (msg.interactiveId === ROOM_BOOK_BUTTON_ID) {
    if (contact.aiPaused) return; // staff has taken over — stay fully silent, same rule the AI queue follows

    const creds = await getWhatsAppCredentials(tenant.id);
    if (creds) {
      const body = "Great choice! Ready to confirm your booking? 🎉";
      try {
        const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, {
          type: "interactive",
          body,
          buttons: confirmBookingPrompt().buttons,
        });
        await prisma.message.create({
          data: {
            tenantId: tenant.id,
            contactId: contact.id,
            direction: "OUT",
            type: "INTERACTIVE",
            content: body,
            whatsappMessageId,
            status: "SENT",
          },
        });
      } catch (err) {
        console.error(`Failed to send confirm-booking prompt for tenant ${tenant.id}, contact ${contact.id}:`, err);
      }
    }
    return;
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
