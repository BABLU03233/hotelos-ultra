import { AIProvider } from "./provider";

/** SambaNova's chat completions endpoint is OpenAI-compatible — plain fetch, no SDK needed. Free tier is thin (20 requests/day per SambaNova's published rate limits, 2026-08) so this sits near the end of the fallback chain — real redundancy, but not a workhorse. */
export const sambanovaProvider: AIProvider = {
  name: "sambanova",
  async chat({ systemPrompt, messages }) {
    const apiKey = process.env.SAMBANOVA_API_KEY;
    if (!apiKey) throw new Error("SAMBANOVA_API_KEY is not set");

    const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct",
        max_tokens: 1024,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`SambaNova chat failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = json.choices[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("SambaNova returned empty content");
    return content;
  },
};
