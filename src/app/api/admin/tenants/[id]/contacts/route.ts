import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Platform-admin visibility across every hotel's guests — for support/quality oversight, not day-to-day CRM use. */
export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  requireAdminSession(req);
  const { id } = await ctx.params;

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) throw notFound("Hotel not found");

  const contacts = await prisma.contact.findMany({
    where: { tenantId: id },
    orderBy: { lastInboundAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      whatsappNumber: true,
      leadStatus: true,
      lastMessage: true,
      lastInboundAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ contacts });
});
