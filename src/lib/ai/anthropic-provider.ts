import Anthropic from "@anthropic-ai/sdk";
import { AIProvider } from "./provider";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    // Bound worst-case latency: the SDK's defaults (2 retries, 10-minute
    // per-request timeout) are meant for a direct caller, not one link in
    // our own fallback chain (pipeline.ts) — left alone, a slow/overloaded
    // response here could stall a guest's reply far longer than just
    // failing fast and letting the chain move on would.
    client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
  }
  return client;
}

export const anthropicProvider: AIProvider = {
  name: "anthropic",
  async chat({ systemPrompt, messages }) {
    const response = await getClient().messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  },
};
