import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw notFound("Campaign not found");

  // Ownership already confirmed via the tenant-scoped lookup above, so a
  // direct query (campaignRecipient has no tenantId of its own) is safe.
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: id },
    include: { contact: { select: { leadStatus: true } } },
  });

  const report = {
    totalContacts: recipients.length,
    pending: recipients.filter((r) => r.status === "PENDING").length,
    sent: recipients.filter((r) => ["SENT", "DELIVERED", "READ", "REPLIED"].includes(r.status)).length,
    delivered: recipients.filter((r) => ["DELIVERED", "READ", "REPLIED"].includes(r.status)).length,
    read: recipients.filter((r) => ["READ", "REPLIED"].includes(r.status)).length,
    replies: recipients.filter((r) => r.status === "REPLIED").length,
    interested: recipients.filter((r) => r.contact.leadStatus === "INTERESTED").length,
    booked: recipients.filter((r) => r.contact.leadStatus === "BOOKED").length,
    failed: recipients.filter((r) => r.status === "FAILED").length,
  };

  return NextResponse.json({ campaign, report });
});
