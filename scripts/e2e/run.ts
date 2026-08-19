/**
 * Functional end-to-end suite.
 *
 *   npm run e2e              run everything, print a report
 *   npm run e2e -- --only=safety-markdown,session-restart-after-gap
 *   npm run e2e -- --area=Safety
 *   npm run e2e -- --verbose  print every transcript, not just failures
 *
 * Writes a markdown report to e2e-report.md and exits non-zero on any failure,
 * so it can gate a deploy.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { assertLocalDatabase, inbound, installStubs, peekOutbox, queueAiReply, resetTurnState, takeOutbox, type SentMessage } from "./harness";
import { SCENARIOS, type Check, type Scenario } from "./scenarios";

// Before ANY app module is imported, so nothing captures the real fetch first.
installStubs();
assertLocalDatabase();

interface CheckResult {
  label: string;
  passed: boolean;
}
interface TurnResult {
  guest: string;
  replies: SentMessage[];
  checks: CheckResult[];
  error?: string;
}
interface ScenarioResult {
  scenario: Scenario;
  turns: TurnResult[];
  passed: boolean;
  durationMs: number;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  return {
    only: get("only")?.split(",").map((s) => s.trim()).filter(Boolean),
    area: get("area"),
    verbose: args.includes("--verbose"),
  };
}

function describeGuest(turn: { say?: string; tap?: { label: string } }): string {
  if (turn.tap) return `[taps "${turn.tap.label}"]`;
  if (turn.say === "") return "[sends a photo with no caption]";
  return turn.say ?? "";
}

async function main() {
  const { only, area, verbose } = parseArgs();

  const { prisma } = await import("@/lib/prisma");
  const { handleInboundMessage } = await import("@/lib/inbound/handle-inbound-message");
  const { processMessageJob } = await import("@/lib/inbound/process-message-job");
  const { createFixture, destroyFixture, ageConversation } = await import("./fixture");

  const selected = SCENARIOS.filter(
    (s) => (!only || only.includes(s.id)) && (!area || s.area.toLowerCase() === area.toLowerCase())
  );
  if (!selected.length) {
    console.error("No scenarios matched that filter.");
    process.exit(1);
  }

  console.log(`\nFunctional E2E — ${selected.length} scenario(s)\n`);

  const results: ScenarioResult[] = [];
  const startedAll = Date.now();

  try {
    for (const [index, scenario] of selected.entries()) {
      // A fresh hotel per scenario. Shared state between scenarios is how a
      // suite starts passing for reasons unrelated to the code under test.
      const fixture = await createFixture(prisma);
      const waId = `9${String(100000000000 + index).slice(0, 11)}`;
      const turns: TurnResult[] = [];
      const started = Date.now();

      for (const turn of scenario.turns) {
        resetTurnState();
        if (turn.ai) queueAiReply(turn.ai);

        if (turn.ageHoursFirst) {
          const existing = await prisma.contact.findFirst({ where: { tenantId: fixture.tenantId, whatsappNumber: waId } });
          if (existing) await ageConversation(prisma, existing.id, turn.ageHoursFirst);
        }

        // A room row id is only knowable once the fixture exists.
        const tap = turn.tap?.id === "ROOM_CHEAPEST" ? { ...turn.tap, id: `room_pick_${fixture.roomIds["Classic Room"]}` } : turn.tap;

        let error: string | undefined;
        try {
          await handleInboundMessage(inbound(waId, { say: turn.say, tap }));
          // Nothing sent means no deterministic short-circuit claimed the turn
          // and it was handed to the queue — run that job inline.
          if (peekOutbox().length === 0) {
            const contact = await prisma.contact.findFirst({ where: { tenantId: fixture.tenantId, whatsappNumber: waId } });
            if (contact) await processMessageJob({ tenantId: fixture.tenantId, contactId: contact.id, messageId: "" } as never);
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }

        const replies = takeOutbox();
        const checks: CheckResult[] = (turn.checks ?? []).map((c: Check) => ({
          label: c.label,
          passed: !error && c.test(replies),
        }));
        turns.push({ guest: describeGuest(turn), replies, checks, error });
      }

      const passed = turns.every((t) => !t.error && t.checks.every((c) => c.passed));
      results.push({ scenario, turns, passed, durationMs: Date.now() - started });

      const failedChecks = turns.flatMap((t) => t.checks.filter((c) => !c.passed));
      console.log(
        `  ${passed ? "PASS" : "FAIL"}  ${scenario.area.padEnd(10)} ${scenario.id}${passed ? "" : `  (${failedChecks.length} check(s) failed)`}`
      );

      if (!passed || verbose) printTranscript(turns);
      await destroyFixture(prisma);
    }
  } finally {
    await destroyFixture(prisma).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }

  const totalMs = Date.now() - startedAll;
  const report = buildReport(results, totalMs);
  writeFileSync("e2e-report.md", report, "utf8");

  const failed = results.filter((r) => !r.passed);
  const totalChecks = results.flatMap((r) => r.turns.flatMap((t) => t.checks));
  console.log(
    `\n${results.length - failed.length}/${results.length} scenarios, ` +
      `${totalChecks.filter((c) => c.passed).length}/${totalChecks.length} checks, ${(totalMs / 1000).toFixed(1)}s`
  );
  console.log("Report written to e2e-report.md\n");
  process.exit(failed.length ? 1 : 0);
}

function printTranscript(turns: TurnResult[]) {
  for (const t of turns) {
    console.log(`        GUEST: ${t.guest}`);
    if (t.error) console.log(`        !! THREW: ${t.error.slice(0, 160)}`);
    for (const r of t.replies) {
      console.log(`        BOT:   ${r.body.replace(/\n/g, " ")}`);
      const opts = [...r.buttons, ...r.rows];
      if (opts.length) console.log(`               [${opts.map((o) => o.title).join(" | ")}]`);
    }
    if (!t.replies.length && !t.error) console.log(`        BOT:   (nothing sent)`);
    for (const c of t.checks) console.log(`          ${c.passed ? "ok  " : "FAIL"} ${c.label}`);
  }
  console.log("");
}

function buildReport(results: ScenarioResult[], totalMs: number): string {
  const failed = results.filter((r) => !r.passed);
  const checks = results.flatMap((r) => r.turns.flatMap((t) => t.checks));
  const byArea = new Map<string, ScenarioResult[]>();
  for (const r of results) byArea.set(r.scenario.area, [...(byArea.get(r.scenario.area) ?? []), r]);

  const lines: string[] = [];
  lines.push(`# Functional E2E report`);
  lines.push("");
  lines.push(`Run ${new Date().toISOString()} · ${(totalMs / 1000).toFixed(1)}s`);
  lines.push("");
  lines.push(`**${results.length - failed.length}/${results.length} scenarios**, **${checks.filter((c) => c.passed).length}/${checks.length} checks**`);
  lines.push("");

  lines.push(`| Area | Scenario | Checks | Result |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const r of results) {
    const c = r.turns.flatMap((t) => t.checks);
    lines.push(
      `| ${r.scenario.area} | ${r.scenario.title} | ${c.filter((x) => x.passed).length}/${c.length} | ${r.passed ? "pass" : "**FAIL**"} |`
    );
  }
  lines.push("");

  if (failed.length) {
    lines.push(`## Failures`);
    lines.push("");
    for (const r of failed) {
      lines.push(`### ${r.scenario.title}  \`${r.scenario.id}\``);
      lines.push("");
      lines.push(`_Why this case exists:_ ${r.scenario.because}`);
      lines.push("");
      lines.push("```");
      for (const t of r.turns) {
        lines.push(`GUEST: ${t.guest}`);
        if (t.error) lines.push(`  !! THREW: ${t.error.slice(0, 200)}`);
        for (const reply of t.replies) {
          lines.push(`BOT:   ${reply.body.replace(/\n/g, " ")}`);
          const opts = [...reply.buttons, ...reply.rows];
          if (opts.length) lines.push(`       [${opts.map((o) => o.title).join(" | ")}]`);
        }
        if (!t.replies.length && !t.error) lines.push(`BOT:   (nothing sent)`);
        for (const c of t.checks) if (!c.passed) lines.push(`  FAILED CHECK: ${c.label}`);
      }
      lines.push("```");
      lines.push("");
    }
  }

  lines.push(`## Coverage`);
  lines.push("");
  for (const [area, rs] of [...byArea.entries()].sort()) {
    lines.push(`### ${area}`);
    lines.push("");
    for (const r of rs) {
      lines.push(`- ${r.passed ? "pass" : "**FAIL**"} — **${r.scenario.title}**  `);
      lines.push(`  ${r.scenario.because}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

main().catch((err) => {
  console.error("\nSUITE CRASHED:", err);
  process.exit(1);
});
