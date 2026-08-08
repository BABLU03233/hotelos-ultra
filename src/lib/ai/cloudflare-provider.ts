import { AIProvider } from "./provider";

/**
 * Cloudflare Workers AI's chat completions endpoint is OpenAI-compatible —
 * plain fetch, no SDK needed. Free tier: 10,000 Neurons/day (Cloudflare's
 * own compute unit, not a 1:1 request count — cost per request varies by
 * model/token count; live-measured at ~0.0057 neurons/token against this
 * app's real system prompt, so ~29 neurons for a typical ~5,100-token
 * reply — roughly 340 replies/day per account), resets daily at UTC
 * midnight. The 10,000/day cap is per Cloudflare *account*, not per token —
 * a second token from the same account shares the same quota, so real
 * redundancy needs a second account's credentials, not just a second token.
 * A factory (not a single fixed provider) for exactly that: a second
 * account's account-ID/token pair can sit right behind the first.
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
          model: process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast",
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
