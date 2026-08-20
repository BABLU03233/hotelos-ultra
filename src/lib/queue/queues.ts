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

/**
 * Set by the functional E2E suite, which drives processMessageJob inline and
 * therefore never needs a job to be picked up.
 *
 * Without it, running the suite would require a live Redis purely to throw the
 * enqueue away — and a test suite meant to run after every change should not
 * depend on a service it does not exercise. Scoped to this one env var and
 * never set in any deployed environment; production always gets a real queue.
 */
const queueDisabled = process.env.E2E_DISABLE_QUEUE === "1";

type MinimalQueue<T> = Pick<Queue<T>, "add">;

function inertQueue<T>(name: string): MinimalQueue<T> {
  return {
    // The caller only ever awaits this; nothing reads the returned Job.
    add: (async () => {
      console.warn(`[queue] ${name}: enqueue skipped (E2E_DISABLE_QUEUE)`);
    }) as unknown as MinimalQueue<T>["add"],
  };
}

/** Inbound WhatsApp message -> AI reply pipeline. The webhook route persists the raw
 *  message synchronously (so it's never lost) and just enqueues the id here. */
export const messageQueue: MinimalQueue<ProcessMessageJob> = queueDisabled
  ? inertQueue<ProcessMessageJob>("message-processing")
  : new Queue<ProcessMessageJob>("message-processing", {
      connection: redisConnection,
      defaultJobOptions,
    });

/** One job per CampaignRecipient — keeps sends rate-limited and individually retryable.
 *
 *  Honours E2E_DISABLE_QUEUE for the same reason messageQueue does. It was
 *  missed when that flag was added, which meant the suite could not cover the
 *  campaign send path at all without a live Redis — so the approval gate, the
 *  single most damaging thing to get wrong here, was untestable. */
export const campaignQueue: MinimalQueue<CampaignSendJob> = queueDisabled
  ? inertQueue<CampaignSendJob>("campaign-send")
  : new Queue<CampaignSendJob>("campaign-send", {
      connection: redisConnection,
      defaultJobOptions,
    });
