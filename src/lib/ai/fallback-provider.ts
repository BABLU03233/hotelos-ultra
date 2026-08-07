import { AIProvider } from "./provider";

/**
 * Tries each provider in order, falling through to the next on any failure
 * (rate limit, outage, missing key) instead of leaving a guest unanswered.
 * Only throws once every provider in the chain has failed — the same
 * "no reply" failure mode the caller (process-message-job.ts) already
 * handles by notifying staff, just now much less likely to trigger.
 */
export function createFallbackProvider(providers: AIProvider[]): AIProvider {
  return {
    async chat(params) {
      const errors: string[] = [];
      for (const provider of providers) {
        const label = provider.name ?? "unnamed-provider";
        const started = Date.now();
        try {
          const reply = await provider.chat(params);
          console.log(`[ai-provider] ${label} replied in ${Date.now() - started}ms`);
          return reply;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[ai-provider] ${label} failed after ${Date.now() - started}ms: ${message}`);
          errors.push(`${label}: ${message}`);
        }
      }
      throw new Error(`All AI providers failed: ${errors.join(" | ")}`);
    },
  };
}
