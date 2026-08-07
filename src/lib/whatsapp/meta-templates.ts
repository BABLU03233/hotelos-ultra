import { MetaTemplateInput } from "@/lib/validation/meta-template";
import { exampleValueForSlot } from "./template-variables";
import { WhatsAppCredentials } from "./client";

const GRAPH_VERSION = "v21.0";

/** One component object as accepted by Meta's Message Templates API — header/body/footer/buttons. */
export type MetaTemplateComponent = Record<string, unknown>;

/**
 * Builds the exact `components` array for Meta's template-creation
 * request from a validated builder submission. `headerHandle` is the
 * Resumable-Upload asset handle for an IMAGE header, required when
 * `input.header.type === "image"`.
 */
export function buildCreateComponents(input: MetaTemplateInput, headerHandle?: string): MetaTemplateComponent[] {
  const components: MetaTemplateComponent[] = [];

  if (input.header.type === "text") {
    components.push({ type: "HEADER", format: "TEXT", text: input.header.text });
  } else if (input.header.type === "image") {
    if (!headerHandle) throw new Error("A header image is required but was not uploaded.");
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } });
  }

  const bodyComponent: MetaTemplateComponent = { type: "BODY", text: input.bodyText };
  if (input.bodyVariableSlots.length > 0) {
    bodyComponent.example = { body_text: [input.bodyVariableSlots.map((slot) => exampleValueForSlot(slot))] };
  }
  components.push(bodyComponent);

  if (input.footerText) {
    components.push({ type: "FOOTER", text: input.footerText });
  }

  if (input.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((b) => {
        if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
        if (b.type === "URL") return { type: "URL", text: b.text, url: b.url };
        if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phoneNumber };
        return { type: "COPY_CODE", example: b.example };
      }),
    });
  }

  return components;
}

export interface CreateMetaTemplateInput {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  components: MetaTemplateComponent[];
}

function requireWabaId(creds: WhatsAppCredentials): string {
  if (!creds.wabaId) throw new Error("This WhatsApp connection has no WABA ID configured — reconnect in Settings.");
  return creds.wabaId;
}

/** Creates a template draft and submits it for Meta's review. Throws Meta's own error message on rejection at submission time (e.g. malformed components) — a separate, later rejection from the review process itself surfaces via status polling, not this call. */
export async function createMetaTemplate(
  creds: WhatsAppCredentials,
  input: CreateMetaTemplateInput
): Promise<{ id: string; status: string }> {
  const wabaId = requireWabaId(creds);
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      category: input.category,
      language: input.language,
      parameter_format: "positional",
      components: input.components,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.error_user_msg || json?.error?.message || `Meta template creation failed (${res.status})`);
  }
  return { id: json.id, status: json.status ?? "PENDING" };
}

/** Polls Meta for a template's current review status. */
export async function getMetaTemplateStatus(
  creds: WhatsAppCredentials,
  metaTemplateId: string
): Promise<{ status: string; rejectedReason: string | null }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${metaTemplateId}?fields=status,rejected_reason`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } }
  );
  if (!res.ok) throw new Error(`Template status lookup failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { status: string; rejected_reason?: string };
  return { status: json.status, rejectedReason: json.rejected_reason ?? null };
}

export interface RemoteMetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: MetaTemplateComponent[];
}

/** Lists every template Meta has on file for this tenant's WABA — used to import templates approved directly in Meta Business Manager, outside this app. */
export async function listMetaTemplates(creds: WhatsAppCredentials): Promise<RemoteMetaTemplate[]> {
  const wabaId = requireWabaId(creds);
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?limit=200`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } }
  );
  if (!res.ok) throw new Error(`Template list failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data: RemoteMetaTemplate[] };
  return json.data;
}

/** Deletes every language variant of a template by name. */
export async function deleteMetaTemplate(creds: WhatsAppCredentials, name: string): Promise<void> {
  const wabaId = requireWabaId(creds);
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${creds.accessToken}` } }
  );
  if (!res.ok) throw new Error(`Template delete failed (${res.status}): ${await res.text()}`);
}

/**
 * Uploads a header image via Meta's Resumable Upload API and returns a
 * handle usable as a template's `header_handle`. Two calls: start a session
 * scoped to this Meta App (WHATSAPP_APP_ID, not the tenant's WABA), then
 * upload the bytes to that session.
 */
export async function uploadHeaderImage(
  creds: WhatsAppCredentials,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const appId = process.env.WHATSAPP_APP_ID;
  if (!appId) throw new Error("WHATSAPP_APP_ID is not set — required to upload a template header image.");

  const startRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(creds.accessToken)}`,
    { method: "POST" }
  );
  if (!startRes.ok) throw new Error(`Starting header image upload failed (${startRes.status}): ${await startRes.text()}`);
  const { id: uploadSessionId } = (await startRes.json()) as { id: string };

  const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${uploadSessionId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${creds.accessToken}`, file_offset: "0" },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) throw new Error(`Header image upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  const { h: handle } = (await uploadRes.json()) as { h: string };
  return handle;
}
