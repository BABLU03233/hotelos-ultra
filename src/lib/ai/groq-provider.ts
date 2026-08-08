import { AIProvider } from "./provider";

/**
 * Groq's chat completions endpoint is OpenAI-compatible — plain fetch, no
 * SDK needed. A factory (not a single fixed provider) so a second Groq
 * account/key can sit right behind the first in the fallback chain —
 * independent daily-token quota, so it's real redundancy rather than
 * hitting the same cap twice.
 */
export function createGroqProvider(apiKeyEnvVar: string, label: string): AIProvider {
  return {
    name: label,
    async chat({ systemPrompt, messages }) {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) throw new Error(`${apiKeyEnvVar} is not set`);

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          max_tokens: 1024,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        throw new Error(`Groq chat failed (${res.status}, ${label}): ${await res.text()}`);
      }

      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      const content = json.choices[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error(`Groq returned empty content (${label})`);
      return content;
    },
  };
}

export const groqProvider = createGroqProvider("GROQ_API_KEY", "groq");
