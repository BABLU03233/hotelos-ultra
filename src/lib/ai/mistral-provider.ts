import { AIProvider } from "./provider";

/** Mistral's chat completions endpoint is OpenAI-compatible — plain fetch, no SDK needed. */
export const mistralProvider: AIProvider = {
  name: "mistral",
  async chat({ systemPrompt, messages }) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        max_tokens: 1024,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Mistral chat failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content ?? "";
  },
};
