import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { CampaignNotApprovedError, queueCampaignSend } from "@/lib/campaigns/send";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw notFound("Campaign not found");

  try {
    const queued = await queueCampaignSend(id);
    return NextResponse.json({ queued });
  } catch (err) {
    // A refused send, not a fault — and the owner needs to be told which of
    // the two reasons applies, since "waiting for review" and "rejected" call
    // for completely different next steps.
    if (err instanceof CampaignNotApprovedError) {
      throw new ApiError(
        409,
        err.approval === "REJECTED"
          ? "This campaign was not approved. Edit it and submit it again."
          : "This campaign is still waiting for approval. You'll be able to send it once it's reviewed."
      );
    }
    throw err;
  }
});
