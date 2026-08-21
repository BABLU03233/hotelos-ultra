import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
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

  // occupancyPrices is a Json column, and Prisma will not take a plain array
  // through a spread — null has to become DbNull explicitly, or "clear the
  // tiers" silently does nothing.
  const { occupancyPrices, ...rest } = body;
  const room = await db.room.update({
    where: { id },
    data: {
      ...rest,
      ...(occupancyPrices === undefined
        ? {}
        : { occupancyPrices: occupancyPrices === null ? Prisma.DbNull : (occupancyPrices as Prisma.InputJsonValue) }),
    },
  });
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
