import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/tenant";

export interface DashboardMetrics {
  newLeads: number;
  activeChats: number;
  bookings: number;
  pendingFollowUps: number;
  aiConversationsToday: number;
  campaignPerformance: { id: string; name: string; sent: number; replies: number }[];
}

export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  const db = tenantDb(tenantId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [newLeads, bookings, pendingFollowUps, activeChatContactIds, aiConversationsToday, recentCampaigns] =
    await Promise.all([
      db.contact.count({ where: { leadStatus: "NEW" } }),
      db.contact.count({ where: { leadStatus: "BOOKED" } }),
      db.scheduledFollowUp.count({ where: { status: "PENDING" } }),
      db.message.findMany({ where: { createdAt: { gte: last24h } }, distinct: ["contactId"], select: { contactId: true } }),
      db.message.findMany({
        where: { createdAt: { gte: startOfToday }, direction: "IN" },
        distinct: ["contactId"],
        select: { contactId: true },
      }),
      db.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, name: true } }),
    ]);

  const campaignPerformance = await Promise.all(
    recentCampaigns.map(async (c) => {
      const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: c.id }, select: { status: true } });
      return {
        id: c.id,
        name: c.name,
        sent: recipients.filter((r) => r.status !== "PENDING").length,
        replies: recipients.filter((r) => r.status === "REPLIED").length,
      };
    })
  );

  return {
    newLeads,
    activeChats: activeChatContactIds.length,
    bookings,
    pendingFollowUps,
    aiConversationsToday: aiConversationsToday.length,
    campaignPerformance,
  };
}
