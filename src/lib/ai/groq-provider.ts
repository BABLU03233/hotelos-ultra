import { AIProvider, timeoutSignal } from "./provider";

/**
 * The chain's first and fastest link — measured at 117-713ms in production,
 * which is the entire reason it sits at the top. Everything about this file
 * is tuned for that one job: answer now, or get out of the way.
 *
 * MODEL CHOICE (re-measured 2026-08-18, against the real production prompt
 * inside the running container, not assumed):
 *
 * `llama-3.3-70b-versatile` — the previous default — was retired by Groq and
 * began returning 404 `model_not_found` on BOTH account keys. Nothing broke
 * loudly: the chain simply fell through to Gemini on every single reply, so
 * guests went from ~500ms answers to 1.2-4.4s ones, and to far worse once
 * Gemini's 20-requests/day/key cap was spent and the chain reached OpenRouter
 * and OmniRoute. A dead top link is a pure latency regression with no error
 * anyone sees — see model-health.ts, which now catches this at startup.
 *
 * Groq's whole Llama family is gone; the surviving general-purpose chat
 * models were benchmarked head to head, 8 scenarios x 3 rounds each, paced
 * under the 12k tokens/min org cap so the numbers measured the model rather
 * than the quota:
 *
 *   openai/gpt-oss-120b   ~200-580ms   <- chosen
 *   openai/gpt-oss-20b    ~460-510ms
 *   qwen/qwen3.6-27b      ~1950ms      emitted raw <think> tags on EVERY reply
 *   groq/compound-mini    ~910ms       a router that internally depends on the
 *                                      same retired Llama this replaces
 *
 * gpt-oss-120b won on both halves. It was the fastest, and it was the only
 * one that passed every safety scenario in the battery: it refused an
 * unlisted amenity ("We don't have a pool or spa listed"), caught a past date
 * unprompted ("26 Jul is already gone—did you mean 26 Aug?"), answered
 * Roman-script Hinglish in Roman script instead of switching to Devanagari,
 * answered Telugu in Telugu, and never invented a rate.
 */
const DEFAULT_MODEL = "openai/gpt-oss-120b";

/**
 * gpt-oss models are reasoning models, and left to themselves they spend the
 * token budget thinking — the exact failure that got `openai/gpt-oss-20b`
 * dropped from the OpenRouter tier earlier ("slow *and* empty: burned its
 * whole token budget on hidden reasoning"). On Groq the effort is
 * controllable, and "low" is what makes this model viable here: a concierge
 * reply is a writing task, not a reasoning one, and the benchmark above ran
 * entirely at "low" with no empty responses and no leaked narration.
 *
 * Sent only to models that accept it — Groq 400s on the parameter otherwise,
 * which would turn an override into an outage of the chain's fastest link.
 */
function reasoningEffortFor(model: string): string | undefined {
  if (!/gpt-oss/i.test(model)) return undefined;
  return process.env.GROQ_REASONING_EFFORT || "low";
}

/**
 * Down from 15s. Nothing here has ever legitimately taken longer than 713ms,
 * so 15s was never a timeout on this provider — it was a timeout on a hung
 * socket, and it let two dead links hold a guest for 30 seconds between them.
 * 6s is roughly 8x the slowest real success, which is headroom for a bad
 * moment without pretending a 10-second Groq reply was ever going to be
 * useful. The chain has eleven more links to try.
 */
const TIMEOUT_MS = 6_000;

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
    async chat({ systemPrompt, messages, signal }) {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) throw new Error(`${apiKeyEnvVar} is not set`);

      const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
      const effort = reasoningEffortFor(model);

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
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
          ...(effort ? { reasoning_effort: effort } : {}),
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        signal: timeoutSignal(TIMEOUT_MS, signal),
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

/** The model the chain will actually ask for — see model-health.ts. */
export const configuredGroqModel = () => process.env.GROQ_MODEL || DEFAULT_MODEL;
