import { AIProvider } from "./provider";

/**
 * OpenRouter's chat completions endpoint is OpenAI-compatible — plain
 * fetch, no SDK needed, same shape as groq-provider.ts/mistral-provider.ts.
 * A factory (not a single fixed provider) so the fallback chain in
 * pipeline.ts can try several different free models before falling through
 * to the other providers — any single free model can be individually
 * rate-limited or briefly flaky, so multiple independent attempts is real
 * redundancy, not just a nicer default.
 *
 * `apiKeyEnvVar` defaults to the original single-account env var for
 * backward compatibility, but accepts a second account's key too — the same
 * "second account, not just a second token" reasoning already used for
 * Groq/Gemini applies here: OpenRouter's free-model cap is 50 requests/day
 * for the *whole account*, shared across every model on that key, so a
 * second account's key is real independent quota, not redundant retries
 * against the same limit.
 */
export function createOpenRouterProvider(model: string, apiKeyEnvVar: string = "OPENROUTER_API_KEY"): AIProvider {
  const label = apiKeyEnvVar === "OPENROUTER_API_KEY" ? `openrouter:${model}` : `openrouter-2:${model}`;
  return {
    name: label,
    async chat({ systemPrompt, messages }) {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) throw new Error(`${apiKeyEnvVar} is not set`);

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://hotelosultra.online",
          "X-Title": "HotelOS Ultra",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        // Shorter than the other providers' 15s, and shorter than this file's
        // own earlier 8s: six of these are now chained in pipeline.ts, so a
        // slow/rate-limited one needs to hand off fast — at 8s each, several
        // failing in a row could stack to 40s+ before a guest sees a reply,
        // which fails the "instant reply" goal even though every individual
        // provider is technically still "working."
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        throw new Error(`OpenRouter chat failed (${res.status}, ${label}): ${await res.text()}`);
      }

      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      const content = json.choices[0]?.message?.content ?? "";
      // A 200 with blank content happens on some free reasoning models when
      // the whole token budget gets eaten by hidden reasoning tokens before
      // any visible answer is written — live-observed on this exact chain.
      // Treating it as success would let the fallback chain hand a guest a
      // blank WhatsApp message; throwing instead sends it to the next model.
      if (!content.trim()) throw new Error(`OpenRouter returned empty content (${label})`);
      return content;
    },
  };
}
