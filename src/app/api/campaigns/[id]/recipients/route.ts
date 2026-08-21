import { NextRequest, NextResponse } from "next/server";
import { CampaignRecipientStatus } from "@/generated/prisma/enums";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const STATUS_VALUES = new Set(Object.values(CampaignRecipientStatus));

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const campaign = await db.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!campaign) throw notFound("Campaign not found");

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status = statusParam && STATUS_VALUES.has(statusParam as CampaignRecipientStatus) ? (statusParam as CampaignRecipientStatus) : undefined;

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { contact: { select: { id: true, name: true, phone: true, leadStatus: true, lastInboundAt: true } } },
  });

  return NextResponse.json({ recipients });
});
