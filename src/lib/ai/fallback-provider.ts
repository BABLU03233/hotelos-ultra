import { AIProvider, ChatParams } from "./provider";

/**
 * How long the whole chain may spend before giving up and letting the caller
 * send its holding message.
 *
 * There was no such ceiling before, and the individual timeouts summed to
 * roughly 190 seconds — 15s x2 Groq, 15s x2 Gemini, 5s x8 OpenRouter, 30s x3
 * OmniRoute. Nothing was likely to hit that, but "unlikely" is the wrong
 * property for the number that decides how long a guest stares at a silent
 * chat. A WhatsApp guest has given up long before three minutes; the honest
 * holding message ("let me get one of our team") is a better answer at that
 * point than a perfect reply nobody is still waiting for.
 *
 * 25s is chosen against measured behaviour rather than picked round: provider
 * failures in production are overwhelmingly FAST (429/404/503 return in tens
 * of milliseconds, not at timeout), so a chain that has to walk to its last
 * link typically arrives there in a couple of seconds with most of the budget
 * intact — enough for OmniRoute, the slowest link at a measured 2.3-14.4s, to
 * still answer. The budget bites only when a provider genuinely hangs, which
 * is exactly the case it exists for.
 */
const DEFAULT_BUDGET_MS = Number(process.env.AI_CHAIN_BUDGET_MS) || 25_000;

/**
 * Below this, starting another provider is worse than stopping. It has no
 * realistic chance of finishing, and the attempt only postpones the holding
 * message the guest is now waiting on.
 */
const MIN_ATTEMPT_MS = 1_000;

/**
 * Bounds one attempt by the chain's remaining budget.
 *
 * Both mechanisms are deliberate. The signal lets a provider that honours it
 * drop its socket immediately; the race guarantees the deadline even for the
 * SDK-based providers (Gemini, Anthropic) that take no signal from us. Only
 * the race is load-bearing for correctness — the signal is what stops
 * abandoned requests piling up on a 1-vCPU box.
 */
async function withDeadline(provider: AIProvider, params: ChatParams, ms: number, label: string): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} cut off: chain budget exhausted after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([provider.chat({ ...params, signal: controller.signal }), expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A configured model that the provider no longer serves. Its own failure
 * class because it is silent, permanent, and expensive in a way an outage
 * is not: every reply still gets answered, just several links further down a
 * chain ordered fastest-first, so the only symptom is that everything got
 * slower. Groq retired `llama-3.3-70b-versatile` exactly this way and the
 * top two links of this chain 404'd for a full day — replies kept arriving,
 * from a provider three times slower, and nothing said why.
 *
 * Logged at its own severity so it is greppable and unmistakable in a log
 * full of ordinary rate-limit noise. src/lib/ai/model-health.ts turns the
 * same failure into something noticed at startup rather than in production.
 */
const MODEL_GONE = /model_not_found|does not exist or you do not have access|\bno longer available\b|404/i;

export function createFallbackProvider(providers: AIProvider[], budgetMs: number = DEFAULT_BUDGET_MS): AIProvider {
  return {
    async chat(params) {
      const deadline = Date.now() + budgetMs;
      const errors: string[] = [];

      let attempted = 0;

      for (const provider of providers) {
        const label = provider.name ?? "unnamed-provider";
        const remaining = deadline - Date.now();

        // The first provider always gets its turn, however small the budget.
        // Otherwise a budget set below MIN_ATTEMPT_MS would skip the entire
        // chain and answer nobody — a misconfigured number silently disabling
        // all AI, which is a far worse failure than the slow reply the budget
        // exists to prevent.
        if (attempted > 0 && remaining < MIN_ATTEMPT_MS) {
          console.warn(
            `[ai-provider] giving up before ${label}: ${budgetMs}ms chain budget spent, ${providers.length - providers.indexOf(provider)} provider(s) untried`
          );
          break;
        }

        attempted++;
        const started = Date.now();
        try {
          const reply = await withDeadline(provider, params, Math.max(remaining, MIN_ATTEMPT_MS), label);
          console.log(`[ai-provider] ${label} replied in ${Date.now() - started}ms`);
          return reply;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const severity = MODEL_GONE.test(message) ? "CRITICAL model unavailable" : "failed";
          console.warn(`[ai-provider] ${label} ${severity} after ${Date.now() - started}ms: ${message}`);
          errors.push(`${label}: ${message}`);
        }
      }

      throw new Error(`All AI providers failed: ${errors.join(" | ")}`);
    },
  };
}
