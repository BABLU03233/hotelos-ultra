import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { campaignQueue } from "@/lib/queue/queues";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw notFound("Campaign not found");

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, status: "PENDING" },
    select: { id: true },
  });

  await Promise.all(
    pending.map((r) => campaignQueue.add("send", { campaignRecipientId: r.id }))
  );
  await db.campaign.update({ where: { id }, data: { sentAt: new Date() } });

  return NextResponse.json({ queued: pending.length });
});
