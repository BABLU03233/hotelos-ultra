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
        try {
          return await provider.chat(params);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
      throw new Error(`All AI providers failed: ${errors.join(" | ")}`);
    },
  };
}
