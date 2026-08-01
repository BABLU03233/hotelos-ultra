import { prisma } from "@/lib/prisma";
import { campaignQueue } from "@/lib/queue/queues";

/** Queues a send job for every still-PENDING recipient of a campaign and stamps sentAt. */
export async function queueCampaignSend(campaignId: string): Promise<number> {
  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    select: { id: true },
  });

  await Promise.all(pending.map((r) => campaignQueue.add("send", { campaignRecipientId: r.id })));
  await prisma.campaign.update({ where: { id: campaignId }, data: { sentAt: new Date() } });

  return pending.length;
}
