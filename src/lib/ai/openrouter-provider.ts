import { AIProvider, timeoutSignal } from "./provider";

// Curated OpenRouter free-tier models for the fallback chain. Ordering is
// re-verified periodically against real production traffic, not assumed
// stable — free-tier model availability on OpenRouter is genuinely volatile
// day to day, not just noisy: a 2026-08-10 re-test (isolating each model
// directly, real system prompt, 4 realistic scenarios including the exact
// hallucination-risk and script-matching cases this session caught real
// providers failing) found the OPPOSITE ranking from the 2026-08-09 test.
// "poolside/laguna-xs-2.1" went 4/4 with zero hallucinations (correctly said
// "I don't have that information" on an unlisted amenity rather than
// inventing one, correctly stayed in Roman-script Hinglish) -- moved to
// first. "nvidia/nemotron-nano-9b-v2" and "nvidia/nemotron-nano-12b-v2-vl"
// each timed out 3 of 4 times (the one success from each was good quality,
// so kept, just not relied on first). "google/gemma-4-26b-a4b-it" failed all
// 4 (timeout once, rate-limited the rest) -- moved last rather than dropped,
// since a currently-bad model can recover next time this is re-checked.
// "nvidia/nemotron-nano-30b-a3b:free" turned out to be an invalid model ID
// (400 from OpenRouter, despite being listed) and "openai/gpt-oss-20b:free"
// came back slow *and* empty (a reasoning model that burned its whole token
// budget on hidden reasoning) — both dropped entirely, not just reordered.
// Excludes narrow specialists (a content-safety classifier, a code-only
// model) unsuited to a general conversational reply.
//
// Lives here rather than in pipeline.ts so model-health.ts can check these
// IDs still exist without importing the whole chain — a model list is the
// provider's own business, and pinned IDs are exactly what goes stale.
const DEFAULT_FREE_MODELS = [
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-4-26b-a4b-it:free",
];

/** The free models the chain will actually try, honouring the env override. */
export function configuredOpenRouterModels(): string[] {
  return (
    process.env.OPENROUTER_FREE_MODELS?.split(",")
      .map((m) => m.trim())
      .filter(Boolean) ?? DEFAULT_FREE_MODELS
  );
}

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
    async chat({ systemPrompt, messages, signal }) {
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
          // 512, not 1024.
          //
          // Groq bills "requested" tokens as input + max_tokens, so this
          // reservation is charged on every call whether or not it is used — and
          // at a measured 5,749-token system prompt it was ~15% of a 8,000/min
          // budget spent on headroom nobody wanted. The RULES cap a reply at three
          // sentences; the longest real reply measured was well under 200 tokens,
          // and 512 still leaves room for a Telugu or Hindi reply (which cost more
          // tokens per character) plus the hidden reasoning gpt-oss spends at
          // reasoning_effort=low.
          //
          // Deliberately not lower: too small a ceiling on a reasoning model is
          // how a reply comes back empty, which this chain treats as a provider
          // failure and fails over on — trading a little headroom for a lot of
          // latency.
          max_tokens: 512,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        // Shorter than the other providers' 15s, and shorter than this file's
        // own earlier 8s: six of these are now chained in pipeline.ts, so a
        // slow/rate-limited one needs to hand off fast — at 8s each, several
        // failing in a row could stack to 40s+ before a guest sees a reply,
        // which fails the "instant reply" goal even though every individual
        // provider is technically still "working."
        signal: timeoutSignal(5_000, signal),
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
