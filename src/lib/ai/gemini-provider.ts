import { ApiError, GoogleGenAI } from "@google/genai";
import { AIProvider, ChatMessage } from "./provider";

/**
 * Free-tier alternative to anthropicProvider — same AIProvider contract.
 * A factory (not a single fixed provider) so a second Gemini account/key
 * can sit right behind the first in the fallback chain — independent
 * quota, so it's real redundancy rather than hitting the same cap twice.
 * Each instance gets its own lazily-created client, keyed by its own env var.
 */
export function createGeminiProvider(apiKeyEnvVar: string, label: string): AIProvider {
  let client: GoogleGenAI | null = null;

  function getClient(): GoogleGenAI {
    if (!client) {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) throw new Error(`${apiKeyEnvVar} is not set`);
      client = new GoogleGenAI({ apiKey });
    }
    return client;
  }

  function generate(systemPrompt: string, messages: ChatMessage[], disableThinking: boolean) {
    return getClient().models.generateContent({
      // "-latest" alias tracks Google's current flash-tier model — pinned
      // versions (e.g. gemini-2.5-flash) get retired from new accounts
      // over time (confirmed: 2.5-flash already 404s "no longer available
      // to new users" as of Aug 2026), so an alias avoids repeating that.
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 1024,
        // The model this alias currently resolves to (gemini-3.6-flash) does
        // "dynamic thinking" by default (thinkingBudget: -1) — live testing
        // showed every reply spending 55-73 hidden reasoning tokens even on
        // a trivial "say OK", and real guest replies taking 4-11s as a
        // direct result. thinkingBudget: 0 disables thinking entirely (per
        // the SDK's own type comment: "0 is DISABLED"), which is the right
        // tradeoff here — a hotel concierge reply doesn't need multi-step
        // reasoning, it needs to be fast. Omitted on retry when a prior
        // attempt on this account 400'd on it — live-discovered that a
        // second Gemini account can reject this exact field with
        // "INVALID_ARGUMENT" even though it's the same model, presumably an
        // account-level feature-flag gap rather than anything about the
        // request itself.
        ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        // No retries: our own fallback chain (pipeline.ts) already moves to
        // the next provider on failure. The SDK's default (5 attempts,
        // exponential backoff up to 60s between tries) was silently adding
        // up to a minute of latency per guest reply on free-tier rate limits.
        httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } },
      },
    });
  }

  return {
    name: label,
    async chat({ systemPrompt, messages }) {
      let response;
      try {
        response = await generate(systemPrompt, messages, true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          response = await generate(systemPrompt, messages, false);
        } else {
          throw err;
        }
      }
      const text = response.text ?? "";
      if (!text.trim()) throw new Error(`Gemini returned empty content (${label})`);
      return text;
    },
  };
}

export const geminiProvider = createGeminiProvider("GEMINI_API_KEY", "gemini");
