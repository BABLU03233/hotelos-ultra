import { describe, expect, it, vi } from "vitest";
import { createFallbackProvider } from "./fallback-provider";
import { AIProvider } from "./provider";

function fakeProvider(behavior: "ok" | "fail", reply = "reply"): AIProvider {
  return {
    chat: vi.fn(async () => {
      if (behavior === "fail") throw new Error(`${reply} failed`);
      return reply;
    }),
  };
}

describe("createFallbackProvider", () => {
  it("returns the first provider's reply when it succeeds", async () => {
    const first = fakeProvider("ok", "from first");
    const second = fakeProvider("ok", "from second");
    const chain = createFallbackProvider([first, second]);

    const result = await chain.chat({ systemPrompt: "sys", messages: [] });

    expect(result).toBe("from first");
    expect(second.chat).not.toHaveBeenCalled();
  });

  it("falls through to the next provider when the first fails", async () => {
    const first = fakeProvider("fail");
    const second = fakeProvider("ok", "from second");
    const chain = createFallbackProvider([first, second]);

    const result = await chain.chat({ systemPrompt: "sys", messages: [] });

    expect(result).toBe("from second");
  });

  it("falls through multiple failures to reach a working provider", async () => {
    const chain = createFallbackProvider([fakeProvider("fail"), fakeProvider("fail"), fakeProvider("ok", "third")]);
    expect(await chain.chat({ systemPrompt: "sys", messages: [] })).toBe("third");
  });

  it("throws with every provider's error message when all fail", async () => {
    const chain = createFallbackProvider([fakeProvider("fail", "a"), fakeProvider("fail", "b")]);
    await expect(chain.chat({ systemPrompt: "sys", messages: [] })).rejects.toThrow(/a failed.*b failed/s);
  });
});
