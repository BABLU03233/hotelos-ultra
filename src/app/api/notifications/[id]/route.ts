import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.staffNotification.findUnique({ where: { id } });
  if (!existing) throw notFound("Notification not found");

  const notification = await db.staffNotification.update({ where: { id }, data: { resolved: true } });
  return NextResponse.json({ notification });
});
