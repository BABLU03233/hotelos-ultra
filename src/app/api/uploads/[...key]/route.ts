import { NextRequest, NextResponse } from "next/server";
import { contentTypeFor, isSafeKey, readStoredImage } from "@/lib/storage/media-store";

/**
 * Serves an uploaded image.
 *
 * Deliberately PUBLIC and unauthenticated: WhatsApp's servers fetch this URL
 * to attach the image to a campaign message, and they carry no session. The
 * protection is that keys are random UUIDs — unguessable, and never listed.
 *
 * Only used when object storage is unconfigured; with STORAGE_* set the URL
 * points at the bucket and this route is never reached.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");

  // The one place a user-supplied path reaches the filesystem. Without this a
  // crafted request could walk out of the upload directory.
  if (!isSafeKey(key)) return new NextResponse("Not found", { status: 404 });

  try {
    const buffer = await readStoredImage(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypeFor(key),
        // Immutable: the key is a UUID, so the bytes behind it never change.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export const runtime = "nodejs";
