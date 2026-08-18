import { randomUUID } from "crypto";

const GRAPH_VERSION = "v21.0";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
}

// Media can be addressed two ways. `link` is a publicly reachable URL, which
// is how Anushka sends the hotel's own room photos. `id` is a media object
// already uploaded to Meta (see uploadWhatsAppMedia), which is how a staff
// attachment from the CRM is sent — this deployment has no object storage
// configured, so there is no public URL to hand Meta, and uploading the bytes
// directly avoids inventing one.
type OutboundMessage =
  | { type: "text"; text: string }
  | { type: "image"; link?: string; id?: string; caption?: string }
  | { type: "document"; link?: string; id?: string; filename: string; caption?: string }
  | { type: "audio"; link?: string; id?: string }
  | { type: "video"; link?: string; id?: string; caption?: string }
  | { type: "location"; latitude: number; longitude: number; name?: string; address?: string }
  | { type: "template"; templateName: string; languageCode?: string; components?: unknown[] }
  // Reply-button interactive message — max 3 buttons, title <=20 chars, id
  // <=256 chars (WhatsApp Cloud API limits, verified against Meta's current
  // docs). Body text lives in this same payload, unlike IMAGE which is a
  // genuinely separate follow-up message.
  | { type: "interactive"; body: string; buttons: { id: string; title: string }[] }
  // List message — for choosing among more than 3 options (e.g. a hotel
  // with more than 3 room types), which reply-buttons can't fit. Max 10
  // rows total across all sections, row title <=24 chars, row description
  // <=72 chars, id <=200 chars, button (the text on the "open list" tab)
  // <=20 chars (WhatsApp Cloud API limits, verified against Meta's current
  // docs).
  | { type: "list"; body: string; buttonText: string; sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[] }
  // A published WhatsApp Flow (native multi-field form: dropdowns, a real
  // date-range calendar) — see src/lib/whatsapp/flows/booking-flow.ts for
  // the flow_json this flowId points to. flow_token isn't used for
  // correlation anywhere in this codebase (the completion arrives as a
  // normal inbound webhook message, already resolved to a contact via the
  // sender's WhatsApp number like any other message) — it's generated fresh
  // per send purely because Meta's API requires some value.
  | { type: "flow"; body: string; flowId: string; flowCta: string; screen: string };

/**
 * Meta accepts exactly one of `id` or `link` on a media object and rejects a
 * payload carrying both, so this picks rather than spreads. `id` wins because
 * bytes we uploaded ourselves are always reachable, whereas a link depends on
 * object storage being configured.
 */
function mediaRef(m: { id?: string; link?: string }): { id: string } | { link: string } {
  if (m.id) return { id: m.id };
  return { link: m.link ?? "" };
}

export function buildPayload(to: string, message: OutboundMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to };
  switch (message.type) {
    case "text":
      return { ...base, type: "text", text: { body: message.text } };
    case "image":
      return { ...base, type: "image", image: { ...mediaRef(message), caption: message.caption } };
    case "document":
      return {
        ...base,
        type: "document",
        document: { ...mediaRef(message), filename: message.filename, caption: message.caption },
      };
    case "audio":
      return { ...base, type: "audio", audio: mediaRef(message) };
    case "video":
      return { ...base, type: "video", video: { ...mediaRef(message), caption: message.caption } };
    case "location":
      return {
        ...base,
        type: "location",
        location: {
          latitude: message.latitude,
          longitude: message.longitude,
          name: message.name,
          address: message.address,
        },
      };
    case "template":
      return {
        ...base,
        type: "template",
        template: {
          name: message.templateName,
          language: { code: message.languageCode ?? "en" },
          components: message.components ?? [],
        },
      };
    case "interactive":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.body },
          action: {
            buttons: message.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: message.body },
          action: {
            button: message.buttonText,
            sections: message.sections.map((s) => ({
              title: s.title,
              rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
            })),
          },
        },
      };
    case "flow":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "flow",
          body: { text: message.body },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: randomUUID(),
              flow_id: message.flowId,
              flow_cta: message.flowCta,
              flow_action: "navigate",
              flow_action_payload: { screen: message.screen, data: {} },
            },
          },
        },
      };
  }
}

/** Sends one WhatsApp message and returns the platform's message id (wamid). Throws on any non-2xx response. */
export async function sendWhatsAppMessage(
  creds: WhatsAppCredentials,
  to: string,
  message: OutboundMessage
): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(to, message)),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { messages: { id: string }[] };
  return json.messages[0].id;
}

/**
 * Uploads bytes to Meta and returns a media id usable as `id` on an outbound
 * image/document/audio/video.
 *
 * This is how a staff attachment leaves the CRM. The alternative — putting the
 * file somewhere public and sending Meta a `link` — needs object storage, and
 * none is configured here; it would also expose a guest's document on a public
 * URL, which is a worse default for a hotel handling ID scans and invoices.
 *
 * Media ids expire after a few days on Meta's side, which is fine for sending
 * (immediate) but means the CRM cannot rely on them for display forever. See
 * the /api/media route for how playback is handled.
 */
export async function uploadWhatsAppMedia(
  creds: WhatsAppCredentials,
  file: Blob,
  filename: string
): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", file, filename);

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    // No Content-Type header: fetch sets the multipart boundary itself, and
    // overriding it produces a silently unparseable body.
    body: form,
  });

  if (!res.ok) throw new Error(`WhatsApp media upload failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("WhatsApp media upload returned no id");
  return json.id;
}

/** Pings the Graph API with a phone_number_id + access token pair and returns the resolved number — lets Settings confirm credentials are correct before saving them. */
export async function verifyCredentials(creds: WhatsAppCredentials): Promise<{ displayNumber: string; verifiedName: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `WhatsApp rejected these credentials (${res.status})`);
  }
  const json = (await res.json()) as { display_phone_number?: string; verified_name?: string };
  return { displayNumber: json.display_phone_number ?? "—", verifiedName: json.verified_name ?? "—" };
}

/** Resolves a WhatsApp media id to a short-lived download URL + mime type. */
export async function getMediaUrl(creds: WhatsAppCredentials, mediaId: string): Promise<{ url: string; mimeType: string }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });
  if (!res.ok) throw new Error(`WhatsApp media lookup failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { url: string; mime_type: string };
  return { url: json.url, mimeType: json.mime_type };
}

/** Downloads media bytes from a WhatsApp-hosted media URL (must be authenticated the same way as the Graph API). */
export async function downloadMedia(creds: WhatsAppCredentials, mediaUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${creds.accessToken}` } });
  if (!res.ok) throw new Error(`WhatsApp media download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
