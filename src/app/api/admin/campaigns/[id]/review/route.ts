import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  // Free text shown to the hotel. Required on rejection — a rejection with no
  // reason gives the owner nothing to act on and just generates a support
  // message asking what was wrong.
  note: z.string().trim().max(1000).optional(),
});

/**
 * The operator's decision on one campaign.
 *
 * Approving unlocks sending; it does NOT send. The owner picked the recipients
 * and owns the timing, and an approval that fired the broadcast immediately
 * would mean a blast going out whenever the operator happened to clear the
 * queue — 3am included. A campaign the owner scheduled still goes out on its
 * own schedule, because sweepDueCampaigns picks up approved campaigns whose
 * time has come.
 */
export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const session = requireAdminSession(req);
  const { id } = await ctx.params;
  const { decision, note } = reviewSchema.parse(await req.json());

  if (decision === "REJECT" && !note) {
    throw new ApiError(400, "Give a reason so the hotel knows what to change.");
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { approval: true, sentAt: true },
  });
  if (!campaign) throw notFound("Campaign not found");

  // Already out the door — nothing to decide, and flipping the flag now would
  // only make the audit trail lie about what was approved before it sent.
  if (campaign.sentAt) {
    throw new ApiError(409, "This campaign has already been sent.");
  }

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: session.adminId },
    select: { name: true },
  });

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      approval: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewedAt: new Date(),
      // Stored as a name, not a relation: who approved a broadcast is an audit
      // record and must outlive the admin account being deleted.
      reviewedByName: admin?.name ?? "Platform admin",
      reviewNote: note ?? null,
    },
    select: { id: true, approval: true, reviewedAt: true, reviewedByName: true, reviewNote: true },
  });

  return NextResponse.json({ campaign: updated });
});

export const runtime = "nodejs";
