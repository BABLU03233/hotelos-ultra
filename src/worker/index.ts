// Standalone worker process — NOT part of the Next.js server. Run with
// `npm run worker` (dev) or as the container's worker process in prod (see
// Dockerfile). Deliberately loads its own env since it never goes through
// Next.js's automatic .env loading.
import "dotenv/config";
import { createServer } from "http";
import { Worker } from "bullmq";
import { sweepDueCampaigns } from "@/lib/campaigns/send";
import { sendCampaignToRecipient } from "@/lib/campaigns/send-recipient";
import { sweepDueFollowUpReminders } from "@/lib/contacts/reminder-sweep";
import { sweepDueFollowUps } from "@/lib/follow-ups/sweep";
import { processMessageJob } from "@/lib/inbound/process-message-job";
import { redisConnection } from "@/lib/queue/redis";
import { CampaignSendJob, ProcessMessageJob } from "@/lib/queue/queues";

// This process has no HTTP traffic of its own — this listener exists only
// so a host that requires a bound port for health checks (e.g. running the
// worker as a free-tier "web service" instead of a paid background-worker
// service) sees it as healthy. No-op when PORT isn't set (local `npm run
// worker`, or a real background-worker host that doesn't need this).
if (process.env.PORT) {
  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("worker ok");
  }).listen(Number(process.env.PORT), () => {
    console.log(`Health-check listener on :${process.env.PORT}`);
  });
}

// Each Worker gets its own dedicated connection (rather than sharing one
// instance) — BullMQ Workers need a dedicated connection for their internal
// blocking-read loop, and sharing one across multiple Workers in the same
// process is a known source of a worker silently never registering as
// connected (confirmed here: getWorkers() showed 0 for campaign-send until
// this fix, despite the process starting cleanly with no errors).
const messageWorker = new Worker<ProcessMessageJob>(
  "message-processing",
  async (job) => processMessageJob(job.data),
  { connection: redisConnection.duplicate(), concurrency: 5 }
);

// Rate-limited per the spec ("respecting rate limits") — 10/s is comfortably
// under WhatsApp's default per-number throughput tiers.
const campaignWorker = new Worker<CampaignSendJob>(
  "campaign-send",
  async (job) => sendCampaignToRecipient(job.data.campaignRecipientId),
  { connection: redisConnection.duplicate(), concurrency: 5, limiter: { max: 10, duration: 1000 } }
);

messageWorker.on("failed", (job, err) => console.error(`message-processing job ${job?.id} failed:`, err));
campaignWorker.on("failed", (job, err) => console.error(`campaign-send job ${job?.id} failed:`, err));

const SWEEP_INTERVAL_MS = 60_000;

async function runFollowUpSweep() {
  try {
    const result = await sweepDueFollowUps();
    if (result.sent || result.skipped || result.failed) {
      console.log("Follow-up sweep:", result);
    }
  } catch (err) {
    console.error("Follow-up sweep failed:", err);
  }
}

// Same lightweight polling pattern as the follow-up sweep — a scheduled
// campaign is a single row check, not worth a dedicated BullMQ delayed job.
async function runCampaignScheduleSweep() {
  try {
    const sent = await sweepDueCampaigns();
    if (sent) console.log(`Campaign schedule sweep: sent ${sent} scheduled campaign(s)`);
  } catch (err) {
    console.error("Campaign schedule sweep failed:", err);
  }
}

async function runReminderSweep() {
  try {
    const count = await sweepDueFollowUpReminders();
    if (count) console.log(`Follow-up reminder sweep: notified staff about ${count} due reminder(s)`);
  } catch (err) {
    console.error("Follow-up reminder sweep failed:", err);
  }
}

async function runSweeps() {
  await runFollowUpSweep();
  await runCampaignScheduleSweep();
  await runReminderSweep();
}

runSweeps();
const sweepInterval = setInterval(runSweeps, SWEEP_INTERVAL_MS);

console.log("HotelOS Ultra worker started — message-processing, campaign-send, follow-up + campaign-schedule + reminder sweep (every 60s).");

async function shutdown() {
  clearInterval(sweepInterval);
  await Promise.all([messageWorker.close(), campaignWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
