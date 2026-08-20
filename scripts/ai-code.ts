/**
 * A coding-assistant CLI powered by OmniRoute's free model pools —
 * https://github.com/diegosouzapw/OmniRoute — the same self-hosted gateway
 * already wired into Anushka's reply chain (see src/lib/ai/omniroute-provider.ts).
 *
 * That integration is deliberately untouched here: this script only IMPORTS
 * createOmniRouteProvider, it does not modify it or the chain order Anushka
 * depends on. This is a second, independent consumer of the same gateway,
 * for coding questions rather than guest replies.
 *
 * Usage:
 *   npm run ai:code -- "explain this regex: ^(?=.*[A-Z]).{8,}$"
 *   git diff | npm run ai:code -- "review this diff"
 *   cat src/lib/foo.ts | npm run ai:code
 *
 * With CLI args AND piped stdin, the stdin content is appended as a fenced
 * code block under the question — the common case of "here's a diff/file,
 * answer this about it" needs both, not one or the other.
 *
 * Same auto-jump behaviour as the guest chain: tries each configured free
 * pool in order and falls through to the next on failure (rate limit,
 * timeout, empty reply), via the same createFallbackProvider used there.
 *
 * Only reachable where OMNIROUTE_BASE_URL resolves — the gateway runs on the
 * production VPS's internal Docker network and is deliberately never exposed
 * publicly (see omniroute-provider.ts). Run this from inside that network
 * (e.g. `docker exec hotelos-worker npx tsx scripts/ai-code.ts -- "..."`),
 * or open an SSH tunnel from a laptop rather than exposing the port:
 *   ssh -L 8000:omniroute:8000 root@<vps-ip>
 *   OMNIROUTE_BASE_URL=http://localhost:8000 npm run ai:code -- "..."
 */
import "dotenv/config";
import { createFallbackProvider } from "../src/lib/ai/fallback-provider";
import { createOmniRouteProvider } from "../src/lib/ai/omniroute-provider";

const DEFAULT_MODELS = ["auto/coding:free", "auto/reasoning:free", "auto/best-free"];

// Same env override this gateway already supports for the guest chain
// (OMNIROUTE_MODELS), reused here rather than inventing a second variable —
// one place to swap a free pool that goes bad, for both consumers.
const MODELS =
  process.env.OMNIROUTE_MODELS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean) ?? DEFAULT_MODELS;

const SYSTEM_PROMPT = `You are a terse, precise coding assistant. Answer the question directly.

- Lead with the answer, not a restatement of the question.
- Real, runnable code in fenced blocks with the language tagged. No pseudocode when real code is what was asked for.
- If you don't know, or the question depends on something you can't see (a file you weren't shown, a version you're not sure of), say so plainly instead of guessing.
- No filler ("Great question!", "Sure, I'd be happy to help"), no restating what was pasted, no summary at the end.
- Keep it as short as the question allows. A one-line answer to a one-line question is correct, not lazy.`;

function readArgPrompt(): string {
  return process.argv.slice(2).join(" ").trim();
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ""; // nothing piped in — don't hang waiting for input that isn't coming
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  if (!process.env.OMNIROUTE_BASE_URL) {
    console.error(
      "OMNIROUTE_BASE_URL is not set.\n\n" +
        "This gateway runs on the production VPS's internal Docker network and is\n" +
        "deliberately never exposed publicly. Either run this from inside that\n" +
        "network (docker exec hotelos-worker npx tsx scripts/ai-code.ts -- \"...\")\n" +
        "or open an SSH tunnel first:\n" +
        "  ssh -L 8000:omniroute:8000 root@<vps-ip>\n" +
        "  OMNIROUTE_BASE_URL=http://localhost:8000 npm run ai:code -- \"...\"\n"
    );
    process.exit(1);
  }

  const argPrompt = readArgPrompt();
  const piped = await readStdin();

  if (!argPrompt && !piped) {
    console.error('Usage: npm run ai:code -- "your question"  (or pipe a file/diff in via stdin)');
    process.exit(1);
  }

  const prompt = piped ? `${argPrompt || "What does this mean, and is there anything wrong with it?"}\n\n\`\`\`\n${piped}\n\`\`\`` : argPrompt;

  const chain = createFallbackProvider(MODELS.map((m) => createOmniRouteProvider(m)));

  try {
    const reply = await chain.chat({ systemPrompt: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }] });
    console.log(reply.trim());
  } catch (err) {
    console.error(`\nAll free OmniRoute pools failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
