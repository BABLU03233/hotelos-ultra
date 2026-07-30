import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export interface ProcessMessageJob {
  tenantId: string;
  contactId: string;
  messageId: string;
}

export interface CampaignSendJob {
  campaignRecipientId: string;
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

/** Inbound WhatsApp message -> AI reply pipeline. The webhook route persists the raw
 *  message synchronously (so it's never lost) and just enqueues the id here. */
export const messageQueue = new Queue<ProcessMessageJob>("message-processing", {
  connection: redisConnection,
  defaultJobOptions,
});

/** One job per CampaignRecipient — keeps sends rate-limited and individually retryable. */
export const campaignQueue = new Queue<CampaignSendJob>("campaign-send", {
  connection: redisConnection,
  defaultJobOptions,
});
