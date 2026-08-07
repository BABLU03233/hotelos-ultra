import { AIProvider } from "./provider";

/**
 * OpenRouter's chat completions endpoint is OpenAI-compatible — plain
 * fetch, no SDK needed, same shape as groq-provider.ts/mistral-provider.ts.
 * A factory (not a single fixed provider) so the fallback chain in
 * pipeline.ts can try two different free models before falling through to
 * the other providers — a single free model can be individually
 * rate-limited or briefly flaky, so two independent attempts is real
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
        // Shorter than the other providers' 15s: these are free-tier models
        // further down the fallback chain now, so a slow/rate-limited one
        // should hand off quickly rather than stack its own 15s wait on top
        // of whatever the earlier providers in the chain already spent.
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        throw new Error(`OpenRouter chat failed (${res.status}, model=${model}): ${await res.text()}`);
      }

      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return json.choices[0]?.message?.content ?? "";
    },
  };
}
