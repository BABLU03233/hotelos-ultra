import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";
import { templateBodyText } from "@/lib/campaigns/auto-review";

/**
 * The operator's cross-tenant campaign review queue.
 *
 * Uses `prisma` directly rather than a tenant-scoped client on purpose: the
 * whole point of this screen is to see every hotel's pending broadcasts in one
 * place. requireAdminSession is what stands between this and the world, and an
 * admin session is structurally distinct from a tenant one (no tenantId, so a
 * hotel's token cannot verify as an admin token).
 */
export const GET = apiRoute(async (req: NextRequest) => {
  requireAdminSession(req);

  const status = req.nextUrl.searchParams.get("status") ?? "PENDING_REVIEW";
  const valid = ["PENDING_REVIEW", "APPROVED", "REJECTED", "DRAFT"] as const;
  const approval = (valid as readonly string[]).includes(status)
    ? (status as (typeof valid)[number])
    : "PENDING_REVIEW";

  const campaigns = await prisma.campaign.findMany({
    where: { approval },
    // Oldest first for the pending queue — a hotel waiting on review should
    // not be overtaken by one that submitted later.
    orderBy: approval === "PENDING_REVIEW" ? { submittedAt: "asc" } : { reviewedAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      type: true,
      messageType: true,
      body: true,
      mediaUrl: true,
      templateName: true,
      approval: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedByName: true,
      reviewNote: true,
      autoReview: true,
      scheduledAt: true,
      sentAt: true,
      sendPacing: true,
      sendIntervalSeconds: true,
      tenant: { select: { id: true, name: true, slug: true } },
      metaTemplate: { select: { name: true, category: true, language: true, components: true } },
      _count: { select: { recipients: true } },
    },
  });

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      ...c,
      metaTemplate: undefined,
      // The reviewer needs the text the guest will actually receive, not the
      // template's internal name — resolved here so the client never has to
      // understand Meta's component array.
      previewText: c.metaTemplate ? templateBodyText(c.metaTemplate.components) : c.body,
      templateMeta: c.metaTemplate
        ? { name: c.metaTemplate.name, category: c.metaTemplate.category, language: c.metaTemplate.language }
        : null,
      recipientCount: c._count.recipients,
    })),
  });
});

export const runtime = "nodejs";
