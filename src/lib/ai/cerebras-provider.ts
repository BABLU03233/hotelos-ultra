import { AIProvider } from "./provider";

/** Cerebras' chat completions endpoint is OpenAI-compatible — plain fetch, no SDK needed, same shape as groq-provider.ts. Free-tier card requirement is disputed between Cerebras' own docs pages as of 2026-08 — confirm at signup. */
export const cerebrasProvider: AIProvider = {
  name: "cerebras",
  async chat({ systemPrompt, messages }) {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) throw new Error("CEREBRAS_API_KEY is not set");

    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.CEREBRAS_MODEL || "gemma-4-31b",
        max_tokens: 1024,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Cerebras chat failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = json.choices[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("Cerebras returned empty content");
    return content;
  },
};
