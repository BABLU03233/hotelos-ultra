import { prisma } from "@/lib/prisma";
import { campaignQueue } from "@/lib/queue/queues";

/**
 * Queues a send job for every still-PENDING recipient of a campaign and stamps sentAt.
 * ALL_AT_ONCE relies on the worker's existing global rate limiter (10/s, shared
 * across every tenant) — every job is enqueued with no delay, same as before this
 * feature existed. SPACED staggers each recipient by sendIntervalSeconds via a
 * per-job BullMQ delay, for large batches the owner wants paced out rather than
 * blasted; orderBy keeps that stagger deterministic (1st/2nd/3rd recipient).
 */
export async function queueCampaignSend(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { sendPacing: true, sendIntervalSeconds: true },
  });

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
 */
export async function sweepDueCampaigns(now = new Date()): Promise<number> {
  const due = await prisma.campaign.findMany({
    where: { scheduledAt: { lte: now }, sentAt: null },
    select: { id: true },
  });

  for (const campaign of due) {
    await queueCampaignSend(campaign.id);
  }

  return due.length;
}
