import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const contact = await db.contact.findUnique({ where: { id }, select: { id: true } });
  if (!contact) throw notFound("Contact not found");

  const followUps = await db.scheduledFollowUp.findMany({
    where: { contactId: id },
    orderBy: { runAt: "asc" },
    take: 20,
    include: { rule: { select: { action: true, messageBody: true } } },
  });

  return NextResponse.json({ followUps });
});
