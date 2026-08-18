import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { downloadMedia, getMediaUrl } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Streams a message's attachment back to the CRM.
 *
 * WhatsApp media lives behind an access token: the URL Meta hands back is
 * short-lived and needs the same Authorization header as the Graph API, so a
 * browser cannot load it directly from an <img src>. With no object storage
 * configured in this deployment there is also no copy of our own to serve, so
 * this route is the only way staff can see what a guest sent, or re-open what
 * they themselves sent.
 *
 * `id` is the Message row id, deliberately not the raw Meta media id: that
 * keeps the lookup tenant-scoped through the same query extension as every
 * other route, so one hotel cannot fetch another's attachments by guessing an
 * id from a webhook.
 */
export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { session, db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const message = await db.message.findUnique({
    where: { id },
    select: { mediaId: true, mediaUrl: true, mediaMimeType: true, mediaFilename: true },
  });
  if (!message) throw notFound("Message not found");

  // When object storage IS configured the stored URL is already public and
  // permanent — prefer it, and skip a Graph round-trip entirely.
  if (message.mediaUrl) {
    return NextResponse.redirect(message.mediaUrl, 302);
  }

  if (!message.mediaId) throw notFound("This message has no attachment");

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) throw new ApiError(400, "WhatsApp isn't connected");

  let buffer: Buffer;
  let contentType: string;
  try {
    const { url, mimeType } = await getMediaUrl(creds, message.mediaId);
    const downloaded = await downloadMedia(creds, url);
    buffer = downloaded.buffer;
    contentType = downloaded.contentType || mimeType || message.mediaMimeType || "application/octet-stream";
  } catch {
    // Meta expires media ids after a few days. That is expected rather than
    // exceptional, so it gets a clear status the UI can render as "attachment
    // expired" instead of a generic failure.
    throw new ApiError(410, "This attachment is no longer available from WhatsApp");
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.byteLength),
      // inline so images render in the chat rather than downloading.
      "Content-Disposition": `inline; filename="${(message.mediaFilename ?? "attachment").replace(/"/g, "")}"`,
      // Private: this is one hotel's guest correspondence, and may be an ID
      // document. It must never land in a shared cache.
      "Cache-Control": "private, max-age=3600",
    },
  });
});
