import { AIProvider } from "./provider";

/**
 * OmniRoute (https://github.com/diegosouzapw/OmniRoute) — a self-hosted,
 * OpenAI-compatible gateway that fans a single request out across a large
 * pool of free provider tiers and fails over between them internally.
 *
 * Added because this app's own chain runs entirely on free tiers with no
 * paid safety net configured (ANTHROPIC_API_KEY is unset in production), so
 * when Groq, Gemini and OpenRouter are simultaneously exhausted a guest gets
 * the fixed holding line instead of a real answer. OmniRoute is a second,
 * much deeper pool behind those — one more link in the chain rather than a
 * replacement for it.
 *
 * Deliberately placed AFTER the direct providers, not in front of them:
 *
 *   - Latency. Groq answers in well under a second; routing every reply
 *     through an extra hop on the same 1-vCPU box would tax the common case
 *     to help the rare one.
 *   - Blast radius. A misconfigured or stopped gateway must degrade this
 *     app to exactly what it does today, never worse. Sitting last, a
 *     failure here costs nothing that isn't already lost.
 *
 * Runs container-to-container over the internal Docker network, so the
 * gateway is never exposed publicly and needs no inbound firewall rule. It
 * also holds its own provider credentials, which keeps this app's env free
 * of yet another set of keys.
 */
export function createOmniRouteProvider(model: string): AIProvider {
  const label = `omniroute:${model}`;
  return {
    name: label,
    async chat({ systemPrompt, messages }) {
      // Unset in any environment without the gateway running (local dev,
      // CI), so this link fails instantly with no network call and the chain
      // moves on — same contract every other provider here follows.
      const baseUrl = process.env.OMNIROUTE_BASE_URL;
      if (!baseUrl) throw new Error("OMNIROUTE_BASE_URL is not set");

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // The gateway can run with REQUIRE_API_KEY=false on a private network;
      // the header is sent only when a key is actually configured.
      if (process.env.OMNIROUTE_API_KEY) headers.Authorization = `Bearer ${process.env.OMNIROUTE_API_KEY}`;

      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          // Explicit, and load-bearing: this gateway streams by DEFAULT. Omit
          // it and the response body is a Server-Sent Events stream of
          // `data:` chunks rather than a JSON object, so parsing it as JSON
          // yields nothing and every reply would look like an empty answer.
          stream: false,
          max_tokens: 1024,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        // Longer than the 5s given to a single OpenRouter model, because a
        // request here may legitimately try several upstreams internally
        // before answering — that internal retry is the whole point of this
        // link.
        //
        // 30s, not the 20s first chosen: the same pool measured 2.3s on one
        // check and 14.4s an hour later, so latency here swings by ~6x with
        // whichever upstream it lands on. A 20s ceiling sat close enough to
        // the observed worst case that a slightly slower day would time out
        // the ONE link standing between a guest and the holding message.
        // Nothing downstream is waiting on this — by the time execution
        // reaches here every faster provider has already failed.
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error(`OmniRoute chat failed (${res.status}, ${label}): ${await res.text()}`);

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content ?? "";
      // Same guard as the OpenRouter link: a 200 carrying empty content is a
      // failure, not a success. Treating it as success would hand a guest a
      // blank WhatsApp message instead of falling through.
      if (!content.trim()) throw new Error(`OmniRoute returned empty content (${label})`);
      return content;
    },
  };
}
