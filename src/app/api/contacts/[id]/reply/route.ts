import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { sendWhatsAppMessage, uploadWhatsAppMedia } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";
import { classifyAttachment, describeLimit, exceedsLimit } from "@/lib/whatsapp/attachment";
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

  // Deliberately NOT blocked when the 24-hour window looks closed.
  //
  // The first version of this refused the send outright. That was wrong for
  // two reasons. Meta owns this clock, not us: our `lastInboundAt` and Meta's
  // own measurement can disagree by seconds around the boundary, and a guest
  // who messaged from a second device may have reopened a window we cannot
  // see — so a local refusal can block a send that would actually have gone
  // through. And staff would rather try and be told it failed than be
  // prevented from trying at all.
  //
  // What made the original bug harmful was never that the send was allowed,
  // it was that failure was invisible: Meta returns 200 with a message id and
  // drops the delivery asynchronously, so the bubble showed a tick. That is
  // fixed at the other end now — the status webhook's errors[] is captured
  // and rendered on the message with a plain explanation. Attempting and
  // reporting honestly beats refusing on a guess.
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
    const raw = (await req.json()) as { text?: string; templateName?: string; templateLanguage?: string };

    if (raw.templateName) {
      // The only thing WhatsApp will deliver outside the 24-hour window, and
      // until now there was no way to send one to a single contact — templates
      // existed solely for campaigns and imports. So a hotel with an approved
      // template still could not reach a guest who had gone quiet, which is
      // the entire complaint this endpoint kept receiving.
      const templateName = raw.templateName;
      const languageCode = raw.templateLanguage || "en_US";
      const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, {
        type: "template",
        templateName,
        languageCode,
      });
      sendResult = {
        whatsappMessageId,
        type: "TEXT",
        // Recorded by name: the rendered text lives with Meta, and the
        // transcript should still show that something was sent and what.
        content: `[template: ${templateName}]`,
        mediaId: null,
        mediaMimeType: null,
        mediaFilename: null,
      };
    } else {
      const { text } = contactReplySchema.parse(raw);
      const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text });
      sendResult = { whatsappMessageId, type: "TEXT", content: text, mediaId: null, mediaMimeType: null, mediaFilename: null };
    }
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
    // aiPausedAt is stamped so the pause can expire. Without it, one manual
    // reply silenced the assistant for this guest permanently.
    db.contact.update({
      where: { id },
      data: { lastMessage: sendResult.content ?? "", aiPaused: true, aiPausedAt: new Date() },
    }),
    db.scheduledFollowUp.updateMany({ where: { contactId: id, status: "PENDING" }, data: { status: "CANCELLED" } }),
  ]);

  return NextResponse.json({ message });
});
