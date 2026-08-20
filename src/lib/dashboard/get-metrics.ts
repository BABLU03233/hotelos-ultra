import { conversationMode } from "@/lib/crm/handover";
import { isHotLead } from "@/lib/crm/hot-lead";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/tenant";
import { DashboardMetrics, LeadSource, LeadStatus } from "@/types";

const LEAD_STATUSES: LeadStatus[] = ["NEW", "INTERESTED", "FOLLOW_UP", "BOOKED", "CLOSED"];
const LEAD_SOURCES: LeadSource[] = ["DIRECT", "META_AD", "COLD_IMPORT"];
const TREND_DAYS = 14;

export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  const db = tenantDb(tenantId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const prev24h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const trendStart = new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000);

  const [
    newLeads,
    bookings,
    pendingFollowUps,
    activeChatContactIds,
    activeChatContactIdsPrev,
    aiConversationsToday,
    aiConversationsYesterday,
    recentCampaigns,
    leadFunnelRaw,
    leadSourceRaw,
    unresolvedNotificationCount,
    recentNotifications,
    trendMessages,
    hotelProfile,
    roomCount,
    faqCount,
    tenant,
    deskContacts,
  ] = await Promise.all([
    db.contact.count({ where: { leadStatus: "NEW" } }),
    db.contact.count({ where: { leadStatus: "BOOKED" } }),
    db.scheduledFollowUp.count({ where: { status: "PENDING" } }),
    db.message.findMany({ where: { createdAt: { gte: last24h } }, distinct: ["contactId"], select: { contactId: true } }),
    db.message.findMany({
      where: { createdAt: { gte: prev24h, lt: last24h } },
      distinct: ["contactId"],
      select: { contactId: true },
    }),
    db.message.findMany({
      where: { createdAt: { gte: startOfToday }, direction: "IN" },
      distinct: ["contactId"],
      select: { contactId: true },
    }),
    db.message.findMany({
      where: { createdAt: { gte: startOfYesterday, lt: startOfToday }, direction: "IN" },
      distinct: ["contactId"],
      select: { contactId: true },
    }),
    db.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, name: true } }),
    db.contact.groupBy({ by: ["leadStatus"], _count: { _all: true } }),
    db.contact.groupBy({ by: ["leadSource"], _count: { _all: true } }),
    db.staffNotification.count({ where: { resolved: false } }),
    db.staffNotification.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { contact: { select: { id: true, name: true, phone: true } } },
    }),
    db.message.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true, direction: true, senderUserId: true },
    }),
    db.hotelProfile.findUnique({ where: { tenantId } }),
    db.room.count(),
    db.faq.count(),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { whatsappPhoneNumberId: true } }),
    // Everything the two desk figures below are derived from. Fetched as rows
    // rather than counted in SQL because "hot" is a scored rule over several
    // columns (see lib/crm/hot-lead.ts) and "needs a human" spans two — and
    // re-implementing either in a query is how the dashboard and the CRM start
    // disagreeing about the same guests. One list, one rule, two readers.
    db.contact.findMany({
      where: { leadStatus: { notIn: ["CLOSED"] } },
      select: {
        leadStatus: true,
        bookingStatus: true,
        pendingRoomId: true,
        pendingCheckIn: true,
        pendingCheckOut: true,
        pendingGuestCount: true,
        lastInboundAt: true,
        optedOutAt: true,
        aiPaused: true,
        handoverAt: true,
      },
    }),
  ]);

  const hotLeads = deskContacts.filter((c) => isHotLead(c)).length;
  const needsHuman = deskContacts.filter((c) => conversationMode(c) !== "ai").length;

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

  const leadFunnel = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const row of leadFunnelRaw) leadFunnel[row.leadStatus] = row._count._all;

  const leadsBySource = Object.fromEntries(LEAD_SOURCES.map((s) => [s, 0])) as Record<LeadSource, number>;
  for (const row of leadSourceRaw) leadsBySource[row.leadSource] = row._count._all;

  const trendBuckets = new Map<string, { inbound: number; ai: number; staff: number }>();
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(trendStart.getTime() + i * 24 * 60 * 60 * 1000);
    trendBuckets.set(d.toISOString().slice(0, 10), { inbound: 0, ai: 0, staff: 0 });
  }
  for (const m of trendMessages) {
    const key = m.createdAt.toISOString().slice(0, 10);
    const bucket = trendBuckets.get(key);
    if (!bucket) continue;
    if (m.direction === "IN") bucket.inbound++;
    else if (m.senderUserId) bucket.staff++;
    else bucket.ai++;
  }
  const messageVolumeTrend = Array.from(trendBuckets.entries()).map(([date, counts]) => ({ date, ...counts }));
  // Reuses the trend data already fetched above rather than a separate
  // query — the last bucket built is always today's, since trendBuckets
  // spans trendStart..startOfToday inclusive in order.
  const todayKey = startOfToday.toISOString().slice(0, 10);
  const todayCounts = trendBuckets.get(todayKey) ?? { ai: 0, staff: 0 };

  return {
    aiAgentName: hotelProfile?.aiAgentName?.trim() || "Anushka",
    newLeads,
    activeChats: activeChatContactIds.length,
    activeChatsPrev: activeChatContactIdsPrev.length,
    bookings,
    pendingFollowUps,
    hotLeads,
    needsHuman,
    aiConversationsToday: aiConversationsToday.length,
    aiConversationsPrev: aiConversationsYesterday.length,
    aiMessagesToday: todayCounts.ai,
    staffMessagesToday: todayCounts.staff,
    leadFunnel,
    leadsBySource,
    messageVolumeTrend,
    unresolvedNotificationCount,
    recentNotifications: recentNotifications.map((n) => ({
      id: n.id,
      reason: n.reason,
      type: n.type,
      resolved: n.resolved,
      createdAt: n.createdAt.toISOString(),
      contact: n.contact,
    })),
    campaignPerformance,
    setup: {
      hotelProfileComplete: !!hotelProfile?.address,
      roomCount,
      whatsappConnected: !!tenant?.whatsappPhoneNumberId,
      faqCount,
    },
  };
}
