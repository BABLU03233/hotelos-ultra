import { configuredGroqModel } from "./groq-provider";
import { configuredOpenRouterModels } from "./openrouter-provider";

/**
 * Checks that the models this app asks for still exist.
 *
 * Written after a full day of production ran on a retired model. Groq removed
 * `llama-3.3-70b-versatile`, both Groq keys began returning 404
 * `model_not_found`, and nothing announced it — the fallback chain did its
 * job and every guest still got an answer, just from providers three to
 * thirty times slower. A dead link in a fallback chain is invisible by
 * construction: the symptom is latency, and latency has no error message.
 *
 * The check is deliberately cheap enough to run unconditionally at startup.
 * It reads each provider's model CATALOGUE rather than sending a completion,
 * so it costs no tokens and no quota — which matters on an entirely free-tier
 * chain where a health check that burned requests would be its own problem.
 *
 * Only the providers that pin a concrete model ID are checked, because only
 * they can rot this way:
 *   - Groq and OpenRouter name exact models, and those get retired.
 *   - Gemini deliberately uses the "-latest" alias for precisely this reason
 *     (see gemini-provider.ts), so there is no pinned ID to go stale.
 *   - OmniRoute's "auto/*" pools are routing strategies resolved server-side,
 *     not model IDs.
 *
 * Never throws and never blocks startup. A model catalogue being briefly
 * unreachable is not a reason to refuse to process guest messages — the
 * chain already tolerates every provider being down.
 */

export interface ModelHealthEntry {
  provider: string;
  model: string;
  status: "ok" | "MISSING" | "unchecked";
  detail?: string;
}

const CATALOGUE_TIMEOUT_MS = 5_000;

async function fetchModelIds(url: string, apiKey: string): Promise<Set<string>> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 120));
  const json = (await res.json()) as { data?: { id?: string }[] };
  return new Set((json.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)));
}

async function checkProvider(
  provider: string,
  url: string,
  apiKeyEnvVar: string,
  models: string[]
): Promise<ModelHealthEntry[]> {
  const apiKey = process.env[apiKeyEnvVar];
  // An unconfigured provider is a deliberate state, not a fault — it fails
  // instantly in the chain with no network call and costs nothing.
  if (!apiKey) {
    return models.map((model) => ({ provider, model, status: "unchecked" as const, detail: `${apiKeyEnvVar} not set` }));
  }

  let available: Set<string>;
  try {
    available = await fetchModelIds(url, apiKey);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return models.map((model) => ({ provider, model, status: "unchecked" as const, detail: `catalogue unreachable: ${detail}` }));
  }

  return models.map((model) => ({
    provider,
    model,
    status: available.has(model) ? ("ok" as const) : ("MISSING" as const),
  }));
}

export async function verifyConfiguredModels(): Promise<ModelHealthEntry[]> {
  const [groq, openrouter, openrouter2] = await Promise.all([
    checkProvider("groq", "https://api.groq.com/openai/v1/models", "GROQ_API_KEY", [configuredGroqModel()]),
    checkProvider("openrouter", "https://openrouter.ai/api/v1/models", "OPENROUTER_API_KEY", configuredOpenRouterModels()),
    checkProvider("openrouter-2", "https://openrouter.ai/api/v1/models", "OPENROUTER_API_KEY_2", configuredOpenRouterModels()),
  ]);
  return [...groq, ...openrouter, ...openrouter2];
}

/**
 * Runs the check and prints it. Called once at worker startup so a retired
 * model shows up in the deploy logs the same day it happens, instead of as an
 * unexplained slowdown nobody connects back to a model ID.
 */
export async function logModelHealth(): Promise<void> {
  let results: ModelHealthEntry[];
  try {
    results = await verifyConfiguredModels();
  } catch (err) {
    console.warn("[model-health] check could not run:", err);
    return;
  }

  const missing = results.filter((r) => r.status === "MISSING");
  const ok = results.filter((r) => r.status === "ok");

  if (missing.length) {
    // Loud, greppable, and names the fix — this is the line that should have
    // existed a day earlier.
    console.error(
      `[model-health] CRITICAL: ${missing.length} configured model(s) NO LONGER EXIST and will 404 on every request:`
    );
    for (const m of missing) {
      console.error(`[model-health]   ${m.provider} -> ${m.model}  (this link is dead; the chain is silently falling past it)`);
    }
    console.error("[model-health] Fix by pointing the provider at a live model (GROQ_MODEL / OPENROUTER_FREE_MODELS) and redeploying.");
  }

  console.log(
    `[model-health] ${ok.length} model(s) live, ${missing.length} missing, ${results.filter((r) => r.status === "unchecked").length} unchecked.`
  );
}
