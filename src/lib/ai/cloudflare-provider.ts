import { AIProvider } from "./provider";

/**
 * Cloudflare Workers AI's chat completions endpoint is OpenAI-compatible —
 * plain fetch, no SDK needed. Free tier: 10,000 Neurons/day (Cloudflare's
 * own compute unit, not a 1:1 request count), resets daily at UTC midnight.
 * The 10,000/day cap is per Cloudflare *account*, not per token — a second
 * token from the same account shares the same quota, so real redundancy
 * needs a second account's credentials, not just a second token. A factory
 * (not a single fixed provider) for exactly that: a second account's
 * account-ID/token pair can sit right behind the first.
 *
 * Default model is the 70B variant, not the smaller/cheaper 8B one — live
 * production testing 2026-08-09 found the 8B model genuinely hallucinating
 * (claiming a guest's plain-text "What" was a voice note; dumping unrelated
 * hotel facts in response to "Ok") whenever it ended up carrying most of the
 * traffic during a Groq/Gemini quota outage. The 70B model showed zero such
 * failures across 6 repeated live runs of the same scenarios. Costs ~6x more
 * neurons/token (live-measured 0.036 vs 0.0057) — roughly 180 neurons for a
 * typical ~5,100-token reply, so ~55 replies/day per account (~110/day
 * across both accounts) instead of ~340/day per account on the 8B model.
 * That's a real capacity trade, worth it at this stage — a weaker model's
 * wrong answer is worse than a slower correct one; override via
 * CLOUDFLARE_MODEL if throughput ever matters more than accuracy.
 */
export function createCloudflareProvider(accountIdEnvVar: string, apiTokenEnvVar: string, label: string): AIProvider {
  return {
    name: label,
    async chat({ systemPrompt, messages }) {
      const accountId = process.env[accountIdEnvVar];
      const apiToken = process.env[apiTokenEnvVar];
      if (!accountId || !apiToken) throw new Error(`${accountIdEnvVar} or ${apiTokenEnvVar} is not set`);

      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          max_tokens: 1024,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        throw new Error(`Cloudflare Workers AI chat failed (${res.status}, ${label}): ${await res.text()}`);
      }

      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      const content = json.choices[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error(`Cloudflare Workers AI returned empty content (${label})`);
      return content;
    },
  };
}

export const cloudflareProvider = createCloudflareProvider("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "cloudflare");
