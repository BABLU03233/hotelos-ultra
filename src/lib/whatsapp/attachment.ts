/**
 * Classifying a staff attachment for WhatsApp, and the limits Meta enforces.
 *
 * Kept separate from the route so the rules are testable without a request,
 * and so the CRM can apply the same limits before uploading rather than
 * letting a guest-facing send fail on a file the browser could have rejected
 * instantly.
 */

export type AttachmentKind = "image" | "video" | "audio" | "document";

/**
 * Meta's per-type ceilings. Documents are allowed 100MB, but this deployment
 * proxies attachments through a 1-vCPU box with no object storage, so the
 * practical cap is much lower than the platform's — a 100MB upload would tie
 * up the worker for minutes and can't be resumed.
 */
export const MAX_ATTACHMENT_BYTES: Record<AttachmentKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 20 * 1024 * 1024,
};

/**
 * WhatsApp will not accept an arbitrary MIME type: an unsupported one is
 * rejected at upload with an opaque error. These are the types Meta documents
 * as supported, so anything else is deliberately sent as a document — which
 * is both what a person expects (it still arrives, as a file) and what Meta
 * accepts for the widest range of content.
 */
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO = new Set(["video/mp4", "video/3gpp"]);
const AUDIO = new Set(["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"]);

export function classifyAttachment(mimeType: string): AttachmentKind {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  if (IMAGE.has(mime)) return "image";
  if (VIDEO.has(mime)) return "video";
  if (AUDIO.has(mime)) return "audio";
  // Everything else — PDFs, Office files, CSVs, HEIC photos, unknown types —
  // rides as a document rather than being refused. A hotel sending an invoice
  // or an ID scan cares that it arrives, not what Meta calls it.
  return "document";
}

/** Human-readable cap for an error message, e.g. "5MB". */
export function describeLimit(kind: AttachmentKind): string {
  return `${Math.round(MAX_ATTACHMENT_BYTES[kind] / (1024 * 1024))}MB`;
}

export function exceedsLimit(kind: AttachmentKind, bytes: number): boolean {
  return bytes > MAX_ATTACHMENT_BYTES[kind];
}
