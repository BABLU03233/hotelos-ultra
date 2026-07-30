// Standalone worker process — NOT part of the Next.js server. Run with
// `npm run worker` (dev) or as the container's worker process in prod (see
// Dockerfile). Deliberately loads its own env since it never goes through
// Next.js's automatic .env loading.
import "dotenv/config";
import { Worker } from "bullmq";
import { sendCampaignToRecipient } from "@/lib/campaigns/send-recipient";
import { sweepDueFollowUps } from "@/lib/follow-ups/sweep";
import { processMessageJob } from "@/lib/inbound/process-message-job";
import { redisConnection } from "@/lib/queue/redis";
import { CampaignSendJob, ProcessMessageJob } from "@/lib/queue/queues";

const messageWorker = new Worker<ProcessMessageJob>(
  "message-processing",
  async (job) => processMessageJob(job.data),
  { connection: redisConnection, concurrency: 5 }
);

// Rate-limited per the spec ("respecting rate limits") — 10/s is comfortably
// under WhatsApp's default per-number throughput tiers.
const campaignWorker = new Worker<CampaignSendJob>(
  "campaign-send",
  async (job) => sendCampaignToRecipient(job.data.campaignRecipientId),
  { connection: redisConnection, concurrency: 5, limiter: { max: 10, duration: 1000 } }
);

messageWorker.on("failed", (job, err) => console.error(`message-processing job ${job?.id} failed:`, err));
campaignWorker.on("failed", (job, err) => console.error(`campaign-send job ${job?.id} failed:`, err));

const FOLLOW_UP_SWEEP_INTERVAL_MS = 60_000;

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

runFollowUpSweep();
const sweepInterval = setInterval(runFollowUpSweep, FOLLOW_UP_SWEEP_INTERVAL_MS);

console.log("HotelOS Ultra worker started — message-processing, campaign-send, follow-up sweep (every 60s).");

async function shutdown() {
  clearInterval(sweepInterval);
  await Promise.all([messageWorker.close(), campaignWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
