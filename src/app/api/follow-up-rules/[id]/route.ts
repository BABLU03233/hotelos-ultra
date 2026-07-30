import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { followUpRuleUpdateSchema } from "@/lib/validation/follow-up-rule";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const body = followUpRuleUpdateSchema.parse(await req.json());

  const existing = await db.followUpRule.findUnique({ where: { id } });
  if (!existing) throw notFound("Follow-up rule not found");

  const rule = await db.followUpRule.update({ where: { id }, data: body });
  return NextResponse.json({ rule });
});

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.followUpRule.findUnique({ where: { id } });
  if (!existing) throw notFound("Follow-up rule not found");

  await db.followUpRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
