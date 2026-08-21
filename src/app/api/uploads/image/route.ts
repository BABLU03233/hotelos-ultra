import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { storeImage } from "@/lib/storage/media-store";
import { MAX_ATTACHMENT_BYTES } from "@/lib/whatsapp/attachment";

/**
 * Uploads one image and returns its public URL.
 *
 * Exists because the campaign composer asked hotels to paste an "Image URL".
 * Nobody has a URL for a photo on their phone — they have the photo. Getting
 * one meant uploading it somewhere else first, which is a step most owners
 * cannot complete, so the image half of campaigns was effectively unusable.
 *
 * Deliberately generic and separate from the campaign route rather than
 * folded into it as multipart: the campaign POST stays a plain JSON endpoint
 * that takes a mediaUrl, exactly as before, and this becomes reusable for any
 * other screen that needs an image.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const { session } = requireTenantDb(req);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Choose an image to upload.");

  // WhatsApp rejects anything else on an image message, and finding that out
  // at send time — after the campaign is approved and going out — is far
  // worse than finding out here.
  if (!file.type.startsWith("image/")) {
    throw new ApiError(400, "That file isn't an image. JPG or PNG works best.");
  }
  if (file.size > MAX_ATTACHMENT_BYTES.image) {
    throw new ApiError(400, `That image is too large — keep it under ${Math.round(MAX_ATTACHMENT_BYTES.image / (1024 * 1024))}MB.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await storeImage(session.tenantId, buffer, file.type, file.name);

  return NextResponse.json({ url });
});

export const runtime = "nodejs";
