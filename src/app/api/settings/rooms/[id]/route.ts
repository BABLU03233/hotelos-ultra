import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { roomUpdateSchema } from "@/lib/validation/settings";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const body = roomUpdateSchema.parse(await req.json());

  const existing = await db.room.findUnique({ where: { id } });
  if (!existing) throw notFound("Room not found");

  const room = await db.room.update({ where: { id }, data: body });
  return NextResponse.json({ room });
});

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.room.findUnique({ where: { id } });
  if (!existing) throw notFound("Room not found");

  await db.room.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
