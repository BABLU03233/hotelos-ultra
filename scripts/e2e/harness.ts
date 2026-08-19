/**
 * Functional end-to-end harness.
 *
 * Drives the REAL production entry points — handleInboundMessage() for the
 * webhook and every tap short-circuit, processMessageJob() for the AI path —
 * against a real database, with only the two external boundaries replaced:
 * WhatsApp (captured) and the model (scripted).
 *
 * Two lessons from live incidents shaped this.
 *
 * First: earlier harnesses in this project simulated the AI by calling the
 * deterministic helpers directly and inventing replies. They passed 250,000
 * conversations while real bugs shipped, because they never exercised the code
 * that RECEIVES a model's output — where most of the real defects were
 * (markdown reaching guests, an ESCALATE marker mid-reply, a price guard
 * rejecting the hotel's own rates). So the model is stubbed at the HTTP
 * boundary and scripted per turn, which lets a scenario hand the pipeline the
 * exact bad output that caused a production bug and assert we handle it.
 *
 * Second: running a heavy harness against the production VPS drove its load
 * average to 18 and took the site down. This one runs against the LOCAL
 * database only, and refuses to start if pointed anywhere else.
 */
import type { InboundMessage } from "@/lib/whatsapp/webhook";

export interface SentMessage {
  type: string;
  body: string;
  buttons: { id: string; title: string }[];
  rows: { id: string; title: string; description?: string }[];
  /** Raw payload, for assertions the shaped fields don't cover. */
  raw: Record<string, unknown>;
}

const outbox: SentMessage[] = [];
/** Replies the stubbed model will return, in order. Falls back to a neutral line. */
let scriptedReplies: string[] = [];
let aiCallCount = 0;

export function queueAiReply(reply: string) {
  scriptedReplies.push(reply);
}
export function aiCallsMade() {
  return aiCallCount;
}

const DEFAULT_AI_REPLY = "Sure! How can I help you today? 😊";

const AI_HOSTS = ["api.groq.com", "generativelanguage.googleapis.com", "openrouter.ai", "api.anthropic.com"];

/**
 * Must run before any app module is imported, so nothing captures the real
 * fetch first.
 */
export function installStubs() {
  // The suite drives processMessageJob inline, so the BullMQ hop is pure
  // overhead here — and requiring a live Redis to throw an enqueue away would
  // make a suite meant to run after every change depend on a service it never
  // exercises. See queues.ts.
  process.env.E2E_DISABLE_QUEUE = "1";

  // Dummy provider keys. Every provider checks its env var and throws BEFORE
  // making a request, so without these the chain fails on missing config and
  // the HTTP stub below is never reached — the model half of the pipeline
  // would go completely untested while the suite still looked busy. Groq is
  // first in the chain, so a working stub there means nothing else is tried.
  process.env.GROQ_API_KEY ||= "e2e-stub-key";
  // Deliberately NOT filling the rest: if a scenario ever falls past Groq the
  // suite should say so loudly rather than quietly answering from a different
  // stubbed link.

  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("graph.facebook.com")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const interactive = payload.interactive as
        | { body?: { text?: string }; action?: { buttons?: { reply: { id: string; title: string } }[]; sections?: { rows: { id: string; title: string; description?: string }[] }[] } }
        | undefined;
      outbox.push({
        type: String(payload.type ?? "text"),
        body: (payload.text as { body?: string } | undefined)?.body ?? interactive?.body?.text ?? `[${payload.type}]`,
        buttons: interactive?.action?.buttons?.map((b) => b.reply) ?? [],
        rows: interactive?.action?.sections?.flatMap((s) => s.rows) ?? [],
        raw: payload,
      });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.E2E${Math.random().toString(36).slice(2)}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (AI_HOSTS.some((h) => url.includes(h))) {
      aiCallCount++;
      const reply = scriptedReplies.shift() ?? DEFAULT_AI_REPLY;
      // Groq/OpenRouter/Anthropic all read choices[0].message.content in this
      // codebase; returning one shape satisfies whichever link is reached.
      return new Response(
        JSON.stringify({ choices: [{ message: { content: reply } }], content: [{ type: "text", text: reply }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

/** Reads what has been sent so far WITHOUT clearing it. */
export function peekOutbox(): readonly SentMessage[] {
  return outbox;
}

export function takeOutbox(): SentMessage[] {
  const copy = [...outbox];
  outbox.length = 0;
  return copy;
}

export function resetTurnState() {
  outbox.length = 0;
  scriptedReplies = [];
}

export const TEST_SLUG = "e2e-functional-suite";
export const TEST_PNID = "E2E_FUNCTIONAL_PHONE_NUMBER_ID";

/** Refuses to run anywhere but a local database. */
export function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
  if (!local) {
    throw new Error(
      `Refusing to run: DATABASE_URL does not point at a local database.\n` +
        `This suite creates and deletes a tenant, and a heavy run once took the production box down.\n` +
        `Point DATABASE_URL at localhost and try again.`
    );
  }
}

let seq = 0;

/** Builds a webhook-shaped inbound message: typed text, or a button/row tap. */
export function inbound(waId: string, turn: { say?: string; tap?: { id: string; label: string } }): InboundMessage {
  seq++;
  const isTap = Boolean(turn.tap);
  return {
    phoneNumberId: TEST_PNID,
    waId,
    contactName: "E2E Guest",
    whatsappMessageId: `wamid.E2E.${waId}.${seq}.${Date.now()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: isTap ? "interactive" : "text",
    text: isTap ? null : (turn.say ?? ""),
    buttonText: isTap ? turn.tap!.label : null,
    interactiveId: isTap ? turn.tap!.id : null,
    flowResponse: null,
    mediaId: null,
    mediaMimeType: null,
    mediaFilename: null,
    mediaCaption: null,
    location: null,
    referral: null,
  };
}
