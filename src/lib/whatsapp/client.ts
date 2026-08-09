const GRAPH_VERSION = "v21.0";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
}

type OutboundMessage =
  | { type: "text"; text: string }
  | { type: "image"; link: string; caption?: string }
  | { type: "document"; link: string; filename: string; caption?: string }
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
  | { type: "list"; body: string; buttonText: string; sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[] };

export function buildPayload(to: string, message: OutboundMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to };
  switch (message.type) {
    case "text":
      return { ...base, type: "text", text: { body: message.text } };
    case "image":
      return { ...base, type: "image", image: { link: message.link, caption: message.caption } };
    case "document":
      return {
        ...base,
        type: "document",
        document: { link: message.link, filename: message.filename, caption: message.caption },
      };
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
