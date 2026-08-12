import { WhatsAppCredentials } from "../client";
import { buildBookingFlowJson } from "./booking-flow";

const GRAPH_VERSION = "v21.0";

/**
 * Publishes the booking Flow (the native in-WhatsApp date-range calendar +
 * room picker) to Meta and returns its Flow id.
 *
 * This is the piece that was missing. `buildBookingFlowJson` has existed for
 * a while and `handle-inbound-message.ts` sends the Flow whenever
 * `HotelProfile.whatsappBookingFlowId` is set — but nothing anywhere ever
 * SET that column. It was read in two places and written in none, so the
 * calendar was unreachable code: no guest had ever seen it, or could. The
 * "Book a room" tap always silently fell through to the step-by-step button
 * waterfall.
 *
 * Meta's Flows API is three calls, and all three must succeed for the
 * calendar to appear:
 *   1. POST /{waba-id}/flows          — create the Flow shell, get an id
 *   2. POST /{flow-id}/assets         — upload flow.json (this is where
 *                                       structural errors are reported)
 *   3. POST /{flow-id}/publish        — make it sendable to guests
 *
 * Publishing is one-way: a published Flow can be deprecated but not edited,
 * so re-running this creates a NEW Flow rather than mutating the live one.
 * That's why the caller stores the returned id — the old Flow keeps working
 * for anyone mid-conversation until it's deprecated.
 */

function requireWabaId(creds: WhatsAppCredentials): string {
  if (!creds.wabaId) throw new Error("This WhatsApp connection has no WABA ID configured — reconnect it in Settings → WhatsApp.");
  return creds.wabaId;
}

async function metaError(res: Response, fallback: string): Promise<string> {
  const json = await res.json().catch(() => null);
  // error_user_msg is Meta's human-readable form and is far more useful to a
  // hotel owner than the raw internal message, when it's present at all.
  return json?.error?.error_user_msg || json?.error?.message || `${fallback} (${res.status})`;
}

/** Step 1 — create the Flow shell. Returns its id. */
export async function createBookingFlow(creds: WhatsAppCredentials, name: string): Promise<string> {
  const wabaId = requireWabaId(creds);
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/flows`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, categories: ["APPOINTMENT_BOOKING"] }),
  });
  if (!res.ok) throw new Error(await metaError(res, "Creating the booking Flow failed"));
  const json = (await res.json()) as { id: string };
  if (!json.id) throw new Error("Meta accepted the Flow but returned no id.");
  return json.id;
}

/**
 * Step 2 — upload the Flow JSON.
 *
 * Meta validates the structure here and returns `validation_errors` for
 * anything malformed. Those are surfaced verbatim rather than summarised:
 * they name the exact component and property at fault, which is the only
 * practical way to debug a Flow that Meta rejects.
 */
export async function uploadBookingFlowAsset(
  creds: WhatsAppCredentials,
  flowId: string,
  rooms: { id: string; name: string; price: number }[]
): Promise<void> {
  const flowJson = JSON.stringify(buildBookingFlowJson(rooms));
  const form = new FormData();
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  form.append("file", new Blob([flowJson], { type: "application/json" }), "flow.json");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${flowId}/assets`, {
    method: "POST",
    // No Content-Type header — fetch sets the multipart boundary itself, and
    // setting it manually produces a boundary-less header Meta rejects.
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    body: form,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.error_user_msg || json?.error?.message || `Uploading the Flow layout failed (${res.status})`);
  }
  const errors = json?.validation_errors as { message?: string; error_type?: string; pointers?: unknown }[] | undefined;
  if (errors?.length) {
    throw new Error(`Meta rejected the Flow layout: ${errors.map((e) => e.message ?? e.error_type ?? "unknown error").join("; ")}`);
  }
}

/** Step 3 — publish, making the Flow sendable to real guests. */
export async function publishFlow(creds: WhatsAppCredentials, flowId: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${flowId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });
  if (!res.ok) throw new Error(await metaError(res, "Publishing the Flow failed"));
}

/**
 * The whole three-step publish, as one operation.
 *
 * Flow names must be unique per WABA and a published Flow can't be edited,
 * so the name is timestamped — re-publishing after changing rooms or prices
 * always produces a fresh Flow rather than colliding with the existing one.
 */
export async function publishBookingFlow(
  creds: WhatsAppCredentials,
  rooms: { id: string; name: string; price: number }[],
  now: Date = new Date()
): Promise<string> {
  if (!rooms.length) throw new Error("Add at least one room in Settings → Rooms before publishing the booking calendar.");
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const flowId = await createBookingFlow(creds, `booking_${stamp}`);
  await uploadBookingFlowAsset(creds, flowId, rooms);
  await publishFlow(creds, flowId);
  return flowId;
}

/** Deprecates a superseded Flow. Best-effort — never worth failing a publish over. */
export async function deprecateFlow(creds: WhatsAppCredentials, flowId: string): Promise<void> {
  await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${flowId}/deprecate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  }).catch(() => undefined);
}
