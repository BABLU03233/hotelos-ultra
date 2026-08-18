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

/** Present only on the first message of a conversation started from a Click-to-WhatsApp ad. */
export interface InboundReferral {
  headline: string | null;
  sourceUrl: string | null;
  ctwaClid: string | null;
}

export interface InboundMessage {
  phoneNumberId: string;
  waId: string;
  contactName: string | null;
  whatsappMessageId: string;
  timestamp: string;
  type: "text" | "image" | "document" | "location" | "audio" | "video" | "sticker" | "button" | "interactive" | "unknown";
  text: string | null;
  // Set for a template quick-reply click ("button") or an interactive
  // list/button-reply message ("interactive") — the visible label text of
  // whichever option the guest tapped (e.g. "Stop promos").
  buttonText: string | null;
  // The machine-readable id of the tapped option (template button "payload",
  // or interactive button_reply.id/list_reply.id) — distinct from buttonText,
  // which is only the human-readable label. Used to detect specific actions
  // (e.g. the booking-confirmation button) without depending on label text.
  interactiveId: string | null;
  // Structured data from a completed WhatsApp Flow submission (see
  // src/lib/whatsapp/flows/booking-flow.ts) -- WhatsApp calls this an
  // "nfm_reply". Whatever field names the Flow's screen used (e.g. "room",
  // "date_range", "guests") become keys here, straight from the guest's
  // real submission. Null for every other message type.
  flowResponse: Record<string, unknown> | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  location: { latitude: number; longitude: number } | null;
  referral: InboundReferral | null;
}

export interface StatusUpdate {
  phoneNumberId: string;
  whatsappMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  /**
   * Meta's reason for a `failed` status. The send endpoint returns 200 and a
   * message id even for a message that cannot be delivered, and reports the
   * real outcome here instead — so this is the ONLY place the cause ever
   * appears. It was previously parsed away, which is why staff saw a failure
   * marker with no explanation.
   *
   * The one that matters most in practice is 131047 ("Re-engagement
   * message"): the 24-hour customer service window has closed and only a
   * template can reach this guest.
   */
  errorCode: number | null;
  errorTitle: string | null;
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
        const referral = raw.referral as
          | { source_url?: string; headline?: string; ctwa_clid?: string }
          | undefined;

        // Template quick-reply click: { type: "button", button: { text, payload } }.
        // Interactive list/button message: { type: "interactive", interactive: { type: "button_reply"|"list_reply", button_reply|list_reply: { id, title } } }.
        let buttonText: string | null = null;
        let interactiveId: string | null = null;
        let flowResponse: Record<string, unknown> | null = null;
        if (type === "button") {
          const btn = raw.button as { text?: string; payload?: string } | undefined;
          buttonText = btn?.text ?? null;
          interactiveId = btn?.payload ?? null;
        } else if (type === "interactive") {
          const interactive = raw.interactive as
            | {
                button_reply?: { id?: string; title?: string };
                list_reply?: { id?: string; title?: string };
                nfm_reply?: { response_json?: string };
              }
            | undefined;
          buttonText = interactive?.button_reply?.title ?? interactive?.list_reply?.title ?? null;
          interactiveId = interactive?.button_reply?.id ?? interactive?.list_reply?.id ?? null;
          // A completed Flow submission -- response_json is a JSON *string*,
          // not an object. A malformed/unparseable payload should never
          // crash webhook processing; it just leaves flowResponse null and
          // the message falls through to the AI queue like anything else
          // that couldn't be specially handled.
          if (interactive?.nfm_reply?.response_json) {
            try {
              flowResponse = JSON.parse(interactive.nfm_reply.response_json) as Record<string, unknown>;
            } catch {
              flowResponse = null;
            }
          }
        }

        messages.push({
          phoneNumberId,
          waId: String(raw.from ?? ""),
          contactName,
          whatsappMessageId: String(raw.id ?? ""),
          timestamp: String(raw.timestamp ?? ""),
          type,
          text: textBody,
          buttonText,
          interactiveId,
          flowResponse,
          mediaId: media?.id ?? null,
          mediaMimeType: media?.mime_type ?? null,
          location:
            location?.latitude != null && location?.longitude != null
              ? { latitude: location.latitude, longitude: location.longitude }
              : null,
          referral: referral
            ? {
                headline: referral.headline ?? null,
                sourceUrl: referral.source_url ?? null,
                ctwaClid: referral.ctwa_clid ?? null,
              }
            : null,
        });
      }

      for (const raw of value.statuses ?? []) {
        // Meta nests the human-readable half under error_data.details and
        // puts a short label in title; details is the more specific of the
        // two ("Message failed to send because more than 24 hours have
        // passed since the customer last replied"), so it wins when present.
        const err = (raw.errors as { code?: number; title?: string; error_data?: { details?: string } }[] | undefined)?.[0];
        statuses.push({
          phoneNumberId,
          whatsappMessageId: String(raw.id ?? ""),
          status: String(raw.status ?? "sent") as StatusUpdate["status"],
          timestamp: String(raw.timestamp ?? ""),
          errorCode: typeof err?.code === "number" ? err.code : null,
          errorTitle: err?.error_data?.details ?? err?.title ?? null,
        });
      }
    }
  }

  return { messages, statuses };
}
