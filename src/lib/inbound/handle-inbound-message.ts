import { MessageStatus, MessageType } from "@/generated/prisma/enums";
import { transcribeAudio } from "@/lib/ai/transcription";
import { messageQueue } from "@/lib/queue/queues";
import { prisma } from "@/lib/prisma";
import { downloadMedia, getMediaUrl } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials, resolveTenantByPhoneNumberId } from "@/lib/whatsapp/tenant-credentials";
import { InboundMessage, StatusUpdate } from "@/lib/whatsapp/webhook";
import { uploadObject } from "@/lib/storage/s3";

function mapMessageType(type: InboundMessage["type"]): MessageType {
  switch (type) {
    case "text":
      return "TEXT";
    case "image":
      return "IMAGE";
    case "location":
      return "LOCATION";
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
    },
    update: {
      name: msg.contactName ?? undefined,
      lastInboundAt: now,
      lastMessage: preview,
    },
  });

  const messageRow = await prisma.message.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      direction: "IN",
      type: mapMessageType(msg.type),
      content,
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

  await messageQueue.add("process", { tenantId: tenant.id, contactId: contact.id, messageId: messageRow.id });
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
