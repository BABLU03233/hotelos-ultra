import { createHmac, timingSafeEqual } from "crypto";

/** Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body, keyed by the app secret). */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface InboundMessage {
  phoneNumberId: string;
  waId: string;
  contactName: string | null;
  whatsappMessageId: string;
  timestamp: string;
  type: "text" | "image" | "document" | "location" | "audio" | "video" | "sticker" | "unknown";
  text: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  location: { latitude: number; longitude: number } | null;
}

export interface StatusUpdate {
  phoneNumberId: string;
  whatsappMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
}

interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: Record<string, unknown>[];
  statuses?: Record<string, unknown>[];
}

interface WebhookPayload {
  object?: string;
  entry?: { changes?: { value?: WebhookValue; field?: string }[] }[];
}

export function parseWebhookPayload(payload: WebhookPayload): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const contactName = value.contacts?.[0]?.profile?.name ?? null;

      for (const raw of value.messages ?? []) {
        const type = String(raw.type ?? "unknown") as InboundMessage["type"];
        const textBody =
          type === "text" ? ((raw.text as { body?: string } | undefined)?.body ?? null) : null;
        const media = raw[type] as { id?: string; mime_type?: string } | undefined;
        const location = raw.location as { latitude?: number; longitude?: number } | undefined;

        messages.push({
          phoneNumberId,
          waId: String(raw.from ?? ""),
          contactName,
          whatsappMessageId: String(raw.id ?? ""),
          timestamp: String(raw.timestamp ?? ""),
          type,
          text: textBody,
          mediaId: media?.id ?? null,
          mediaMimeType: media?.mime_type ?? null,
          location:
            location?.latitude != null && location?.longitude != null
              ? { latitude: location.latitude, longitude: location.longitude }
              : null,
        });
      }

      for (const raw of value.statuses ?? []) {
        statuses.push({
          phoneNumberId,
          whatsappMessageId: String(raw.id ?? ""),
          status: String(raw.status ?? "sent") as StatusUpdate["status"],
          timestamp: String(raw.timestamp ?? ""),
        });
      }
    }
  }

  return { messages, statuses };
}
