import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";
import { adminUpdateTenantSchema } from "@/lib/validation/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  requireAdminSession(req);
  const { id } = await ctx.params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
      hotelProfile: true,
      _count: { select: { contacts: true, rooms: true, campaigns: true, knowledgeDocs: true } },
    },
  });
  if (!tenant) throw notFound("Hotel not found");

  const [bookedCount, messageCount] = await Promise.all([
    prisma.contact.count({ where: { tenantId: id, leadStatus: "BOOKED" } }),
    prisma.message.count({ where: { tenantId: id } }),
  ]);

  return NextResponse.json({
    tenant: {
      ...tenant,
      whatsappAccessToken: undefined, // never serialize the ciphertext
    },
    stats: {
      contactCount: tenant._count.contacts,
      roomCount: tenant._count.rooms,
      campaignCount: tenant._count.campaigns,
      knowledgeDocCount: tenant._count.knowledgeDocs,
      bookedCount,
      messageCount,
    },
  });
});

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  requireAdminSession(req);
  const { id } = await ctx.params;
  const body = adminUpdateTenantSchema.parse(await req.json());

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) throw notFound("Hotel not found");

  const tenant = await prisma.tenant.update({ where: { id }, data: body });
  return NextResponse.json({ tenant });
});
