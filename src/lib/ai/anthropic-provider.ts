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
      // 512, not 1024.
      //
      // Groq bills "requested" tokens as input + max_tokens, so this
      // reservation is charged on every call whether or not it is used — and
      // at a measured 5,749-token system prompt it was ~15% of a 8,000/min
      // budget spent on headroom nobody wanted. The RULES cap a reply at three
      // sentences; the longest real reply measured was well under 200 tokens,
      // and 512 still leaves room for a Telugu or Hindi reply (which cost more
      // tokens per character) plus the hidden reasoning gpt-oss spends at
      // reasoning_effort=low.
      //
      // Deliberately not lower: too small a ceiling on a reasoning model is
      // how a reply comes back empty, which this chain treats as a provider
      // failure and fails over on — trading a little headroom for a lot of
      // latency.
      max_tokens: 512,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  },
};
