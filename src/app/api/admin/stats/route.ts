import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";

const TREND_DAYS = 14;

export const GET = apiRoute(async (req: NextRequest) => {
  requireAdminSession(req);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const trendStart = new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000);

  const messages = await prisma.message.findMany({
    where: { createdAt: { gte: trendStart } },
    select: { createdAt: true, direction: true, senderUserId: true },
  });

  const buckets = new Map<string, { inbound: number; ai: number; staff: number }>();
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(trendStart.getTime() + i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), { inbound: 0, ai: 0, staff: 0 });
  }
  for (const m of messages) {
    const key = m.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (m.direction === "IN") bucket.inbound++;
    else if (m.senderUserId) bucket.staff++;
    else bucket.ai++;
  }

  return NextResponse.json({
    messageVolumeTrend: Array.from(buckets.entries()).map(([date, counts]) => ({ date, ...counts })),
  });
});
