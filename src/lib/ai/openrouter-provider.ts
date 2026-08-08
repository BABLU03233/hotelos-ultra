import { AIProvider } from "./provider";

/**
 * OpenRouter's chat completions endpoint is OpenAI-compatible — plain
 * fetch, no SDK needed, same shape as groq-provider.ts/mistral-provider.ts.
 * A factory (not a single fixed provider) so the fallback chain in
 * pipeline.ts can try several different free models before falling through
 * to the other providers — any single free model can be individually
 * rate-limited or briefly flaky, so multiple independent attempts is real
 * redundancy, not just a nicer default.
 */
export function createOpenRouterProvider(model: string): AIProvider {
  return {
    name: `openrouter:${model}`,
    async chat({ systemPrompt, messages }) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

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
        throw new Error(`OpenRouter chat failed (${res.status}, model=${model}): ${await res.text()}`);
      }

      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return json.choices[0]?.message?.content ?? "";
    },
  };
}
