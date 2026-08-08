import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";
import { adminUpdateTenantSchema } from "@/lib/validation/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const TREND_DAYS = 14;

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  requireAdminSession(req);
  const { id } = await ctx.params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
      hotelProfile: true,
      _count: { select: { contacts: true, rooms: true, campaigns: true, knowledgeDocs: true } },
    },
  });
  if (!tenant) throw notFound("Hotel not found");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const trendStart = new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000);

  const [bookedCount, messageCount, aiMessageCount, staffMessageCount, trendMessages] = await Promise.all([
    prisma.contact.count({ where: { tenantId: id, leadStatus: "BOOKED" } }),
    prisma.message.count({ where: { tenantId: id } }),
    prisma.message.count({ where: { tenantId: id, direction: "OUT", senderUserId: null } }),
    prisma.message.count({ where: { tenantId: id, direction: "OUT", senderUserId: { not: null } } }),
    prisma.message.findMany({
      where: { tenantId: id, createdAt: { gte: trendStart } },
      select: { createdAt: true, direction: true, senderUserId: true },
    }),
  ]);

  const buckets = new Map<string, { inbound: number; ai: number; staff: number }>();
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(trendStart.getTime() + i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), { inbound: 0, ai: 0, staff: 0 });
  }
  for (const m of trendMessages) {
    const key = m.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (m.direction === "IN") bucket.inbound++;
    else if (m.senderUserId) bucket.staff++;
    else bucket.ai++;
  }

  return NextResponse.json({
    tenant: {
      ...tenant,
      whatsappAccessToken: undefined, // never serialize the ciphertext
    },
    stats: {
      contactCount: tenant._count.contacts,
      roomCount: tenant._count.rooms,
      campaignCount: tenant._count.campaigns,
      knowledgeDocCount: tenant._count.knowledgeDocs,
      bookedCount,
      messageCount,
      aiMessageCount,
      staffMessageCount,
    },
    messageVolumeTrend: Array.from(buckets.entries()).map(([date, counts]) => ({ date, ...counts })),
  });
});

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  requireAdminSession(req);
  const { id } = await ctx.params;
  const body = adminUpdateTenantSchema.parse(await req.json());

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) throw notFound("Hotel not found");

  const tenant = await prisma.tenant.update({ where: { id }, data: body });
  return NextResponse.json({ tenant });
});
