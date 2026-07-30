import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { faqUpdateSchema } from "@/lib/validation/settings";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const body = faqUpdateSchema.parse(await req.json());

  const existing = await db.faq.findUnique({ where: { id } });
  if (!existing) throw notFound("FAQ not found");

  const faq = await db.faq.update({ where: { id }, data: body });
  return NextResponse.json({ faq });
});

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.faq.findUnique({ where: { id } });
  if (!existing) throw notFound("FAQ not found");

  await db.faq.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
