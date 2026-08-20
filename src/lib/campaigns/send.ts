import { prisma } from "@/lib/prisma";
import { campaignQueue } from "@/lib/queue/queues";

/**
 * Thrown when something tries to send a campaign the operator has not
 * approved. A distinct class so API routes can answer 409 rather than 500 —
 * it is a refused request, not a fault.
 */
export class CampaignNotApprovedError extends Error {
  constructor(readonly approval: string) {
    super(`Campaign is ${approval}, not APPROVED — it cannot be sent.`);
    this.name = "CampaignNotApprovedError";
  }
}

/**
 * Queues a send job for every still-PENDING recipient of a campaign and stamps sentAt.
 * ALL_AT_ONCE relies on the worker's existing global rate limiter (10/s, shared
 * across every tenant) — every job is enqueued with no delay, same as before this
 * feature existed. SPACED staggers each recipient by sendIntervalSeconds via a
 * per-job BullMQ delay, for large batches the owner wants paced out rather than
 * blasted; orderBy keeps that stagger deterministic (1st/2nd/3rd recipient).
 *
 * The approval gate lives HERE, not in the API route, because this function is
 * the single chokepoint every send path funnels through — the owner's "Send
 * now" button, the scheduled-campaign sweep, and anything added later. Checking
 * in the route would leave the sweep unguarded, and a scheduled campaign that
 * quietly sends itself at 3am is exactly the hole this feature exists to close.
 */
export async function queueCampaignSend(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { sendPacing: true, sendIntervalSeconds: true, approval: true },
  });

  if (campaign && campaign.approval !== "APPROVED") {
    throw new CampaignNotApprovedError(campaign.approval);
  }

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const intervalMs = (campaign?.sendIntervalSeconds ?? 0) * 1000;
  const spaced = campaign?.sendPacing === "SPACED" && intervalMs > 0;

  await Promise.all(
    pending.map((r, index) =>
      campaignQueue.add(
        "send",
        { campaignRecipientId: r.id },
        spaced ? { delay: index * intervalMs } : undefined
      )
    )
  );
  await prisma.campaign.update({ where: { id: campaignId }, data: { sentAt: new Date() } });

  return pending.length;
}

/**
 * Picks up campaigns whose scheduledAt has come due and haven't been sent
 * yet, and fires them off exactly like clicking "Send now" would. Called on
 * a fixed interval by the worker process (src/worker/index.ts), the same
 * polling-sweep pattern as sweepDueFollowUps — a scheduled campaign is a
 * single row check, not worth a dedicated BullMQ delayed job.
 *
 * Only APPROVED campaigns are picked up. An unapproved one whose time has come
 * simply waits: its scheduledAt stays in the past, so it goes out on the next
 * sweep after the operator approves it, rather than being silently skipped
 * forever. queueCampaignSend would refuse it anyway — filtering here keeps the
 * sweep from throwing once per tick on a campaign still sitting in the queue.
 */
export async function sweepDueCampaigns(now = new Date()): Promise<number> {
  const due = await prisma.campaign.findMany({
    where: { scheduledAt: { lte: now }, sentAt: null, approval: "APPROVED" },
    select: { id: true },
  });

  for (const campaign of due) {
    await queueCampaignSend(campaign.id);
  }

  return due.length;
}
