import { aiProvider } from "@/lib/ai/pipeline";
import { deterministicConcerns, type AutoReview, type ReviewConcern } from "./copy-rules";

/**
 * An automated first pass over a broadcast, before a human operator sees it.
 *
 * The operator is the decision-maker; this exists so they read a
 * recommendation instead of every campaign cold. A hotel writing its own
 * promotional copy is motivated to oversell, and the cost of a bad broadcast
 * is not confined to that hotel: complaints land on the WhatsApp number's
 * quality rating, which is shared platform infrastructure. One careless blast
 * degrades delivery for every other hotel.
 *
 * Deliberately advisory, never automatic. It returns concerns and a verdict;
 * nothing here approves or sends anything. An automated system that could
 * approve on its own would be the single highest-blast-radius component in
 * this codebase, and the review it replaces takes a human about ten seconds.
 */

// The deterministic half lives in copy-rules.ts so the compose box can run it
// in the browser. Re-exported here so the reviewer stays one import for
// server callers.
export type { AutoReview, ReviewConcern, Severity } from "./copy-rules";
export { deterministicConcerns, templateBodyText } from "./copy-rules";

const REVIEW_PROMPT = `You review promotional WhatsApp messages that an Indian hotel wants to broadcast to its past guests. You are advising a human operator who makes the final call.

Judge ONLY these, in order of importance:
1. Would a guest report or block this? (pushy, misleading, too frequent-sounding, or irrelevant)
2. Does it claim anything a hotel cannot honestly promise, or state a price/offer as guaranteed?
3. Is it clear who is messaging and why?
4. Is it written the way a real person texts on WhatsApp — short, warm, plain — rather than as an ad?

Reply with ONLY a JSON object, no prose around it:
{"verdict":"looks-good"|"needs-changes"|"do-not-send","concerns":[{"severity":"block"|"warn"|"note","issue":"one short sentence","suggestion":"one short sentence"}]}

"block" means it should not be sent as written. "warn" means it will probably work but is risky. "note" is a style improvement. Return an empty concerns array if it is genuinely fine — do not invent problems to look thorough.`;

/**
 * The model half. Falls back to the deterministic concerns alone when every
 * free tier is exhausted, rather than blocking submission — the operator can
 * still review by hand, and holding the queue hostage to a rate limit would
 * be worse than a thinner recommendation.
 */
export async function reviewCampaignCopy(body: string): Promise<AutoReview> {
  const deterministic = deterministicConcerns(body);
  const hardBlock = deterministic.some((c) => c.severity === "block");

  // An empty or over-long message needs no model to judge.
  if (hardBlock) {
    return { verdict: "do-not-send", concerns: deterministic, checkedAt: new Date().toISOString() };
  }

  let modelConcerns: ReviewConcern[] = [];
  let modelVerdict: AutoReview["verdict"] | null = null;

  try {
    // The shared chain, with its own system prompt — deliberately NOT
    // generateReply(), which wraps everything in the hotel-concierge persona
    // and would have Anushka answering the campaign as though a guest had
    // sent it to her.
    const raw = await aiProvider.chat({
      systemPrompt: REVIEW_PROMPT,
      messages: [{ role: "user", content: `MESSAGE TO REVIEW:\n"""\n${body}\n"""` }],
    });
    // The model is told to return bare JSON but free tiers wrap it in prose or
    // a fence often enough that finding the object is worth doing.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { verdict?: string; concerns?: ReviewConcern[] };
      if (Array.isArray(parsed.concerns)) {
        modelConcerns = parsed.concerns.filter(
          (c) => c && typeof c.issue === "string" && typeof c.suggestion === "string"
        );
      }
      if (parsed.verdict === "looks-good" || parsed.verdict === "needs-changes" || parsed.verdict === "do-not-send") {
        modelVerdict = parsed.verdict;
      }
    }
  } catch {
    // Every free tier exhausted, or the model returned something unparseable.
    // The deterministic checks still stand and the operator still reviews by
    // hand; a thinner recommendation beats a blocked queue.
  }

  const concerns = [...deterministic, ...modelConcerns];
  const verdict: AutoReview["verdict"] = concerns.some((c) => c.severity === "block")
    ? "do-not-send"
    : concerns.some((c) => c.severity === "warn")
      ? "needs-changes"
      : (modelVerdict ?? "looks-good");

  return { verdict, concerns, checkedAt: new Date().toISOString() };
}
