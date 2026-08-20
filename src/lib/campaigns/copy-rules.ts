/**
 * The rules for judging promotional copy that need no model and no server.
 *
 * Split out of auto-review.ts so the campaign compose box can run them in the
 * browser as the owner types. auto-review.ts imports the AI chain, which pulls
 * in Prisma and every provider — importing it from a client component would
 * drag all of that into the bundle.
 *
 * These are also the rules where a deterministic answer is strictly better
 * than a probabilistic one. A missing opt-out line is a fact about the text,
 * not a judgement call, and it should be caught identically every time —
 * including on the days every free AI tier is exhausted.
 */

export type Severity = "block" | "warn" | "note";

export interface ReviewConcern {
  severity: Severity;
  issue: string;
  suggestion: string;
}

export interface AutoReview {
  verdict: "looks-good" | "needs-changes" | "do-not-send";
  concerns: ReviewConcern[];
  checkedAt: string;
}

/**
 * Checks that need no model at all.
 *
 * Run first and kept separate on purpose: these are the rules where a
 * deterministic answer is strictly better than a probabilistic one. A missing
 * opt-out line is a fact about the text, not a judgement call, and it should
 * be caught identically every time — including on the days every free AI tier
 * is exhausted and the model half of this returns nothing.
 */
export function deterministicConcerns(body: string): ReviewConcern[] {
  const concerns: ReviewConcern[] = [];
  const text = body.trim();

  if (!text) {
    concerns.push({
      severity: "block",
      issue: "The message is empty.",
      suggestion: "Write the message before submitting it for review.",
    });
    return concerns;
  }

  // WhatsApp's Business Messaging Policy requires marketing messages to offer
  // a way out. This app honours STOP (see opt-out.ts), but the guest has to be
  // told that, and Meta treats its absence as a policy violation rather than a
  // style preference.
  if (!/\b(stop|unsubscribe|opt.?out)\b/i.test(text)) {
    concerns.push({
      severity: "warn",
      issue: "No opt-out line.",
      suggestion: 'Add something like "Reply STOP to opt out." — it is required for marketing messages and lowers block rates.',
    });
  }

  // Blocks and reports are what drive the quality rating down, and shouty copy
  // earns both.
  const shouty = text.replace(/[^A-Z]/g, "").length / Math.max(1, text.replace(/[^A-Za-z]/g, "").length);
  if (text.length > 40 && shouty > 0.6) {
    concerns.push({
      severity: "warn",
      issue: "Mostly capital letters.",
      suggestion: "Write it in normal sentence case. All-caps reads as spam and gets reported.",
    });
  }

  if ((text.match(/!/g) ?? []).length > 3) {
    concerns.push({
      severity: "note",
      issue: "Several exclamation marks.",
      suggestion: "One is plenty. Stacked exclamation marks read as a hard sell.",
    });
  }

  // Fabricated urgency is both the most common bad pattern in promotional copy
  // and the one guests punish hardest.
  if (/\b(hurry|last chance|act now|don'?t miss|limited time|only today|expires? (today|soon))\b/i.test(text)) {
    concerns.push({
      severity: "warn",
      issue: "Manufactured urgency.",
      suggestion: "Drop it unless the deadline is real. A genuine offer end-date is fine; invented scarcity loses trust.",
    });
  }

  // WhatsApp caps template body text; a broadcast that exceeds it is rejected
  // at send time, which is a worse place to find out.
  if (text.length > 1024) {
    concerns.push({
      severity: "block",
      issue: `Too long (${text.length} characters).`,
      suggestion: "WhatsApp allows 1024 characters in a template body. Cut it down.",
    });
  }

  if (text.length > 400) {
    concerns.push({
      severity: "note",
      issue: "Long for WhatsApp.",
      suggestion: "Guests skim on a phone. Two or three short lines outperform a paragraph.",
    });
  }

  return concerns;
}

/**
 * Pulls the guest-facing body text out of a Meta template's `components`
 * array, so a template campaign gets reviewed on what the guest will actually
 * read rather than on the campaign's internal name.
 *
 * Returns "" for anything unrecognised — the caller treats an empty body as
 * "nothing to auto-check", which leaves the human review as the only gate.
 * That is the correct failure direction: a template whose shape we cannot
 * parse should not be waved through by a checker that silently found nothing.
 */
export function templateBodyText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const body = components.find(
    (c): c is { type: string; text?: unknown } =>
      typeof c === "object" && c !== null && (c as { type?: unknown }).type === "BODY"
  );
  return typeof body?.text === "string" ? body.text : "";
}
