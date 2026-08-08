import { AIProvider } from "./provider";

/**
 * Cloudflare Workers AI's chat completions endpoint is OpenAI-compatible —
 * plain fetch, no SDK needed. Free tier: 10,000 Neurons/day (Cloudflare's
 * own compute unit, not a 1:1 request count — cost per request varies by
 * model/token count), resets daily at UTC midnight. Needs two env vars,
 * unlike every other provider here, since the endpoint URL itself is
 * account-scoped.
 */
export const cloudflareProvider: AIProvider = {
  name: "cloudflare",
  async chat({ systemPrompt, messages }) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) throw new Error("CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not set");

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
      throw new Error(`Cloudflare Workers AI chat failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = json.choices[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("Cloudflare Workers AI returned empty content");
    return content;
  },
};
