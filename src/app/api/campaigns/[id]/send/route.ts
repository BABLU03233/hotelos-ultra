import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { queueCampaignSend } from "@/lib/campaigns/send";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw notFound("Campaign not found");

  const queued = await queueCampaignSend(id);

  return NextResponse.json({ queued });
});
