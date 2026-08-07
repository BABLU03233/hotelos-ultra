import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Already-enqueued delayed BullMQ jobs just no-op once their recipient row is
// CANCELLED — sendCampaignToRecipient already guards on status === "PENDING".
export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw notFound("Campaign not found");

  const { count } = await db.campaignRecipient.updateMany({
    where: { campaignId: id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ cancelled: count });
});
