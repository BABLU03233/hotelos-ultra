import { AIProvider } from "./provider";

/**
 * Cohere's v2/chat endpoint is NOT OpenAI-compatible — different request
 * shape (still role/content messages, but no top-level "system" convention
 * confirmed, so the system prompt is sent as the first message like the
 * other providers) and a nested response shape
 * (message.content[0].text, not choices[0].message.content). Free trial
 * key limits: 20 requests/minute, capped at 1,000 calls/month total
 * (resets 1st of the month) — genuinely small, but a fully independent
 * quota from everything else in the chain, so real redundancy.
 */
export const cohereProvider: AIProvider = {
  name: "cohere",
  async chat({ systemPrompt, messages }) {
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) throw new Error("COHERE_API_KEY is not set");

    const res = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.COHERE_MODEL || "command-r7b-12-2024",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Cohere chat failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as { message?: { content?: { type: string; text: string }[] } };
    const content = json.message?.content?.find((c) => c.type === "text")?.text ?? "";
    if (!content.trim()) throw new Error("Cohere returned empty content");
    return content;
  },
};
