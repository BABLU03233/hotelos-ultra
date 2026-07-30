import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireOwner } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { staffUpdateSchema } from "@/lib/validation/settings";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const session = requireOwner(req);
  const { id } = await ctx.params;
  const body = staffUpdateSchema.parse(await req.json());

  const existing = await prisma.user.findUnique({ where: { id, tenantId: session.tenantId } });
  if (!existing) throw notFound("Staff member not found");

  const user = await prisma.user.update({ where: { id }, data: body });
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const session = requireOwner(req);
  const { id } = await ctx.params;

  if (id === session.userId) throw new ApiError(400, "You can't remove your own account");

  const existing = await prisma.user.findUnique({ where: { id, tenantId: session.tenantId } });
  if (!existing) throw notFound("Staff member not found");

  if (existing.role === "OWNER") {
    const ownerCount = await prisma.user.count({ where: { tenantId: session.tenantId, role: "OWNER" } });
    if (ownerCount <= 1) throw new ApiError(400, "A hotel needs at least one owner");
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
