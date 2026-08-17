import { describe, expect, it, vi } from "vitest";
import { createFallbackProvider } from "./fallback-provider";
import { AIProvider } from "./provider";

const PARAMS = { systemPrompt: "s", messages: [{ role: "user" as const, content: "hi" }] };

function answering(name: string, reply: string, delayMs = 0): AIProvider {
  return {
    name,
    chat: async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return reply;
    },
  };
}

function failing(name: string, message = "boom"): AIProvider {
  return { name, chat: async () => { throw new Error(message); } };
}

/** Never settles on its own — stands in for a hung socket. */
function hanging(name: string): AIProvider {
  return { name, chat: () => new Promise<string>(() => {}) };
}

describe("fallback chain", () => {
  it("returns the first provider that answers", async () => {
    const chain = createFallbackProvider([answering("a", "from-a"), answering("b", "from-b")]);
    expect(await chain.chat(PARAMS)).toBe("from-a");
  });

  it("falls through failures to the next provider", async () => {
    const chain = createFallbackProvider([failing("a"), failing("b"), answering("c", "from-c")]);
    expect(await chain.chat(PARAMS)).toBe("from-c");
  });

  it("throws only once every provider has failed, naming each", async () => {
    const chain = createFallbackProvider([failing("a", "rate limited"), failing("b", "404")]);
    await expect(chain.chat(PARAMS)).rejects.toThrow(/a: rate limited[\s\S]*b: 404/);
  });
});

describe("the chain's overall time budget", () => {
  // The bug this exists for: individual timeouts summed to ~190s, so a run of
  // hung providers could hold a guest in silence for over three minutes. No
  // single number in the code said "three minutes" — it was just what the
  // parts added up to.
  it("does not wait for a hung provider past the budget", async () => {
    const chain = createFallbackProvider([hanging("stuck")], 1500);
    const started = Date.now();
    await expect(chain.chat(PARAMS)).rejects.toThrow();
    const elapsed = Date.now() - started;

    // Both bounds matter. The upper one is the fix (it would hang forever
    // otherwise); the lower one is what stops this test passing for the wrong
    // reason — an earlier version used a budget below MIN_ATTEMPT_MS, so the
    // chain gave up without trying anything and the assertion "passed"
    // without the deadline ever being exercised.
    expect(elapsed).toBeGreaterThan(1200);
    expect(elapsed).toBeLessThan(3000);
  });

  it("stops rather than starting a provider it cannot afford to finish", async () => {
    const later = vi.fn(async () => "never reached");
    const chain = createFallbackProvider([hanging("stuck"), { name: "later", chat: later }], 1500);

    await expect(chain.chat(PARAMS)).rejects.toThrow();

    // The point of the budget: once it's spent, the honest holding message
    // beats another attempt the guest is no longer waiting for.
    expect(later).not.toHaveBeenCalled();
  });

  it("always tries the first provider, however small the budget", async () => {
    // A budget below MIN_ATTEMPT_MS must not skip the whole chain. Answering
    // nobody is a much worse outcome than the slow reply the budget guards
    // against, and it would come from a mistyped env var.
    const chain = createFallbackProvider([answering("a", "answered anyway")], 10);
    expect(await chain.chat(PARAMS)).toBe("answered anyway");
  });

  it("still tries every provider when they fail fast, since the budget is untouched", async () => {
    // Real production failures are fast — 429/404/503 return in milliseconds
    // rather than at timeout — so a normal bad day must still reach the
    // bottom of the chain. A budget that cut those off would trade a rare
    // hang for a common outage.
    const chain = createFallbackProvider(
      [failing("a"), failing("b"), failing("c"), failing("d"), answering("last", "made-it")],
      2000
    );
    expect(await chain.chat(PARAMS)).toBe("made-it");
  });

  it("aborts the running provider's signal when the budget expires", async () => {
    let aborted = false;
    const watcher: AIProvider = {
      name: "watcher",
      chat: ({ signal }) =>
        new Promise<string>((_, reject) => {
          signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    };

    const chain = createFallbackProvider([watcher], 1500);
    await expect(chain.chat(PARAMS)).rejects.toThrow();

    // Without this, an abandoned request keeps its socket open to its own
    // timeout — up to 30s for OmniRoute, on a 1-vCPU box running five jobs.
    expect(aborted).toBe(true);
  });

  it("charges elapsed time against the budget across providers", async () => {
    // Three 400ms failures inside a 1.5s budget: the third must still be
    // tried, the fourth must not, because by then under a second remains.
    const fourth = vi.fn(async () => "too late");
    const slowFail = (n: string): AIProvider => ({
      name: n,
      chat: async () => {
        await new Promise((r) => setTimeout(r, 400));
        throw new Error("slow failure");
      },
    });

    const chain = createFallbackProvider([slowFail("a"), slowFail("b"), { name: "d", chat: fourth }], 1500);
    await expect(chain.chat(PARAMS)).rejects.toThrow();
    expect(fourth).not.toHaveBeenCalled();
  });
});

describe("a retired model is reported as its own failure class", () => {
  // The failure that motivated all of this: Groq retired
  // llama-3.3-70b-versatile, both keys 404'd, and because the chain did its
  // job every guest still got answered — just three times slower, with
  // nothing in the logs distinguishing a dead link from ordinary rate-limit
  // noise.
  it("logs a model_not_found failure at CRITICAL, not as a routine failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chain = createFallbackProvider([
      failing("groq", 'Groq chat failed (404, groq): {"error":{"code":"model_not_found"}}'),
      answering("next", "ok"),
    ]);

    await chain.chat(PARAMS);

    expect(warn.mock.calls.flat().join(" ")).toMatch(/CRITICAL model unavailable/);
    warn.mockRestore();
  });

  it("does not shout about an ordinary rate limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chain = createFallbackProvider([failing("groq", "429 rate_limit_exceeded"), answering("next", "ok")]);

    await chain.chat(PARAMS);

    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/CRITICAL/);
    warn.mockRestore();
  });
});
