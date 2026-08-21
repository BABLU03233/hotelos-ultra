import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { uploadObject } from "./s3";

/**
 * Stores an uploaded image and returns a URL WhatsApp can fetch.
 *
 * Two backends, chosen by what is actually configured:
 *
 *   S3-compatible object storage, when STORAGE_* is set. Preferred — it
 *   survives the box being rebuilt and does not put user uploads on the
 *   application server.
 *
 *   A directory on disk otherwise. This exists because the deployed
 *   environment has no object storage configured, and shipping an upload
 *   button that fails with "Object storage is not configured" would be the
 *   same class of bug as the button that silently did nothing.
 *
 * The disk path MUST be a mounted volume (see scripts/deploy.sh). Containers
 * are replaced wholesale on every deploy, so anything written inside the image
 * is gone the next time we ship — and a campaign scheduled for next week would
 * go out pointing at an image that no longer exists.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

/**
 * Joins a key onto the upload directory.
 *
 * The turbopackIgnore comments here and at each fs call below are load-bearing,
 * and all of them are needed — removing any one brings the warning back.
 * UPLOAD_DIR is an env var, so the build's dependency tracer cannot see where
 * these reads and writes land; it assumes the worst and traces the ENTIRE
 * project into the standalone output. That silently bloats the deploy image, on
 * a 1-vCPU box that has already been OOM-killed mid-build once. These paths
 * never point into project source — they point at a mounted volume — so there
 * is nothing real for the tracer to find.
 */
function uploadPath(key: string): string {
  return path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, key);
}

export function objectStorageConfigured(): boolean {
  return Boolean(
    process.env.STORAGE_ENDPOINT && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY && process.env.STORAGE_BUCKET
  );
}

/** Extension for the stored file, so the serving route can set a content type. */
function extensionFor(contentType: string): string {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  return ".jpg";
}

export function contentTypeFor(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/**
 * Rejects anything that could escape the upload directory.
 *
 * Keys are generated here and never come from a user, but the SERVING route
 * takes its key straight from the URL path — so this is the one check standing
 * between a crafted request and reading arbitrary files off the container.
 */
export function isSafeKey(key: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9/_-]*\.(jpg|png|webp|gif)$/.test(key) && !key.includes("..");
}

export async function storeImage(
  tenantId: string,
  buffer: Buffer,
  contentType: string,
  filename?: string,
  /** Groups uploads in object storage; ignored on the disk backend, where the
   * key is already tenant-namespaced and randomly named. */
  folder = "campaigns"
): Promise<string> {
  if (objectStorageConfigured()) {
    return uploadObject(tenantId, folder, buffer, contentType, filename);
  }

  // Tenant-namespaced, random name, and an extension derived from the content
  // type rather than the uploaded filename — an attacker-supplied name never
  // reaches the filesystem.
  const key = `${tenantId}/${randomUUID()}${extensionFor(contentType)}`;
  const full = uploadPath(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, buffer);

  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set — an uploaded image needs a public URL WhatsApp can fetch.");
  }
  return `${base}/api/uploads/${key}`;
}

export async function readStoredImage(key: string): Promise<Buffer> {
  return readFile(/*turbopackIgnore: true*/ uploadPath(key));
}
