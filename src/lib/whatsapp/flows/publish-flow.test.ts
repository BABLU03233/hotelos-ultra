import { afterEach, describe, expect, it, vi } from "vitest";
import { publishBookingFlow, uploadBookingFlowAsset } from "./publish-flow";
import type { WhatsAppCredentials } from "../client";

const CREDS: WhatsAppCredentials = { phoneNumberId: "pn1", accessToken: "tok", wabaId: "waba1" };
const ROOMS = [
  { id: "r1", name: "Classic Room", price: 999 },
  { id: "r2", name: "Deluxe Room", price: 1299 },
];
const NOW = new Date("2026-08-12T06:00:00Z");

function mockFetch(handlers: ((url: string, init?: RequestInit) => Response | undefined)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    for (const h of handlers) {
      const r = h(u, init);
      if (r) return r;
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("publishBookingFlow", () => {
  it("creates, uploads and publishes — in that order", async () => {
    const calls = mockFetch([
      (u) => (u.endsWith("/flows") ? json({ id: "flow123" }) : undefined),
      (u) => (u.endsWith("/assets") ? json({ success: true }) : undefined),
      (u) => (u.endsWith("/publish") ? json({ success: true }) : undefined),
    ]);

    const flowId = await publishBookingFlow(CREDS, ROOMS, NOW);
    expect(flowId).toBe("flow123");
    expect(calls.map((c) => c.url.split("/").pop())).toEqual(["flows", "assets", "publish"]);
    // Created against the WABA, not the phone number id — a real distinction
    // that silently 404s if confused.
    expect(calls[0].url).toContain("/waba1/flows");
  });

  it("refuses to publish a calendar with no rooms in it", async () => {
    mockFetch([]);
    await expect(publishBookingFlow(CREDS, [], NOW)).rejects.toThrow(/at least one room/i);
  });

  it("fails clearly when the connection has no WABA id", async () => {
    mockFetch([]);
    await expect(publishBookingFlow({ ...CREDS, wabaId: undefined }, ROOMS, NOW)).rejects.toThrow(/WABA ID/i);
  });

  it("surfaces Meta's own error message rather than a generic one", async () => {
    mockFetch([(u) => (u.endsWith("/flows") ? json({ error: { error_user_msg: "Flow name already exists" } }, 400) : undefined)]);
    await expect(publishBookingFlow(CREDS, ROOMS, NOW)).rejects.toThrow("Flow name already exists");
  });

  it("does not publish when the layout upload is rejected", async () => {
    const calls = mockFetch([
      (u) => (u.endsWith("/flows") ? json({ id: "flow123" }) : undefined),
      (u) => (u.endsWith("/assets") ? json({ error: { message: "bad component" } }, 400) : undefined),
    ]);
    await expect(publishBookingFlow(CREDS, ROOMS, NOW)).rejects.toThrow("bad component");
    expect(calls.some((c) => c.url.endsWith("/publish"))).toBe(false);
  });

  it("treats a 200 carrying validation_errors as a failure, not a success", async () => {
    // Meta returns HTTP 200 with a validation_errors array for a structurally
    // invalid layout — checking res.ok alone would publish a broken calendar.
    mockFetch([
      (u) => (u.endsWith("/assets") ? json({ validation_errors: [{ message: "CalendarPicker: invalid min-date" }] }) : undefined),
    ]);
    await expect(uploadBookingFlowAsset(CREDS, "flow123", ROOMS)).rejects.toThrow(/invalid min-date/);
  });

  it("explains the integrity block instead of repeating Meta's undiagnosable message", async () => {
    // The real response seen live on a WABA that was green on every other
    // signal — the blocker was an unapproved phone-number display name.
    mockFetch([
      (u) =>
        u.endsWith("/flows")
          ? json(
              {
                error: {
                  message: "Blocked by Integrity",
                  code: 139000,
                  error_subcode: 4233020,
                  error_user_title: "Flow publishing failed",
                  error_user_msg: "Integrity requirements not met.",
                },
              },
              400
            )
          : undefined,
    ]);
    const err = await publishBookingFlow(CREDS, ROOMS, NOW).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/display name/i);
    expect(msg).toMatch(/WhatsApp Manager/);
    // The bare Meta string on its own would be a dead end.
    expect(msg).not.toBe("Integrity requirements not met.");
  });

  it("sends the flow json as a multipart FLOW_JSON asset", async () => {
    const calls = mockFetch([(u) => (u.endsWith("/assets") ? json({ success: true }) : undefined)]);
    await uploadBookingFlowAsset(CREDS, "flow123", ROOMS);
    const body = calls[0].init?.body as FormData;
    expect(body.get("asset_type")).toBe("FLOW_JSON");
    expect(body.get("name")).toBe("flow.json");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("never sets a Content-Type header on the multipart upload", async () => {
    // fetch must set the multipart boundary itself; a manual Content-Type
    // produces a boundary-less header Meta rejects.
    const calls = mockFetch([(u) => (u.endsWith("/assets") ? json({ success: true }) : undefined)]);
    await uploadBookingFlowAsset(CREDS, "flow123", ROOMS);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("content-type");
  });
});
