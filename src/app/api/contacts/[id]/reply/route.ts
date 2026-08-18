import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { sendWhatsAppMessage, uploadWhatsAppMedia } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";
import { classifyAttachment, describeLimit, exceedsLimit } from "@/lib/whatsapp/attachment";
import { serviceWindow } from "@/lib/whatsapp/service-window";
import { contactReplySchema } from "@/lib/validation/contact";
import { MessageType } from "@/generated/prisma/enums";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MESSAGE_TYPE: Record<string, MessageType> = {
  image: "IMAGE",
  video: "DOCUMENT",
  audio: "DOCUMENT",
  document: "DOCUMENT",
};

/**
 * A staff member replying manually from the CRM — pauses the AI for this
 * contact (M3: "which pauses AI for that contact until re-enabled") and
 * cancels any pending automated follow-ups, since a human is now driving
 * the conversation directly.
 *
 * Accepts either JSON ({ text }) or multipart/form-data (file + optional
 * caption) — one endpoint, because both are the same act from the sender's
 * point of view and both must clear the same 24-hour window check.
 */
export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { session, db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) throw notFound("Contact not found");

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) throw new ApiError(400, "Connect WhatsApp in Settings before replying");

  // Enforced here, not just hinted at in the UI.
  //
  // The CRM already showed a "24-hour window closed" banner, but the composer
  // stayed live underneath it, so staff kept sending into a closed window.
  // Meta accepts those requests with a 200 and a message id and drops the
  // delivery, so the bubble showed a tick and the guest got nothing —
  // confirmed in production, where every failed outbound went to a contact
  // whose last inbound was over 24 hours old.
  //
  // Refusing here converts a silent delivery failure into an immediate, honest
  // error, and it holds regardless of which client is calling.
  const windowState = serviceWindow(contact.lastInboundAt);
  if (!windowState.open) {
    throw new ApiError(
      409,
      contact.lastInboundAt
        ? "WhatsApp's 24-hour window has closed for this guest — they last messaged over 24 hours ago, so only a Meta-approved template can reach them now. Ask them to message first, or send an approved template."
        : "This guest has never messaged you, so WhatsApp won't deliver a free-form message. Only a Meta-approved template can start the conversation."
    );
  }

  const contentType = req.headers.get("content-type") ?? "";

  let sendResult: { whatsappMessageId: string; type: MessageType; content: string | null; mediaId: string | null; mediaMimeType: string | null; mediaFilename: string | null };

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const caption = String(form.get("caption") ?? "").trim() || undefined;

    if (!(file instanceof File) || file.size === 0) throw new ApiError(400, "No file attached");

    const kind = classifyAttachment(file.type || "application/octet-stream");
    if (exceedsLimit(kind, file.size)) {
      throw new ApiError(400, `That ${kind} is too large — WhatsApp's limit is ${describeLimit(kind)}.`);
    }

    const filename = file.name || `attachment-${Date.now()}`;
    const mediaId = await uploadWhatsAppMedia(creds, file, filename);

    const whatsappMessageId = await sendWhatsAppMessage(
      creds,
      contact.whatsappNumber,
      kind === "image"
        ? { type: "image", id: mediaId, caption }
        : kind === "video"
          ? { type: "video", id: mediaId, caption }
          : kind === "audio"
            ? { type: "audio", id: mediaId }
            : { type: "document", id: mediaId, filename, caption }
    );

    sendResult = {
      whatsappMessageId,
      type: MESSAGE_TYPE[kind],
      // The caption is the message text when there is one; otherwise the
      // filename, so the CRM transcript reads as something rather than blank.
      content: caption ?? filename,
      mediaId,
      mediaMimeType: file.type || null,
      mediaFilename: filename,
    };
  } else {
    const { text } = contactReplySchema.parse(await req.json());
    const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text });
    sendResult = { whatsappMessageId, type: "TEXT", content: text, mediaId: null, mediaMimeType: null, mediaFilename: null };
  }

  const [message] = await db.$transaction([
    db.message.create({
      data: {
        tenantId: session.tenantId,
        contactId: id,
        direction: "OUT",
        type: sendResult.type,
        content: sendResult.content,
        mediaId: sendResult.mediaId,
        mediaMimeType: sendResult.mediaMimeType,
        mediaFilename: sendResult.mediaFilename,
        senderUserId: session.userId,
        whatsappMessageId: sendResult.whatsappMessageId,
        status: "SENT",
      },
    }),
    db.contact.update({ where: { id }, data: { lastMessage: sendResult.content ?? "", aiPaused: true } }),
    db.scheduledFollowUp.updateMany({ where: { contactId: id, status: "PENDING" }, data: { status: "CANCELLED" } }),
  ]);

  return NextResponse.json({ message });
});
