import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { offerUpdateSchema } from "@/lib/validation/settings";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const body = offerUpdateSchema.parse(await req.json());

  const existing = await db.offer.findUnique({ where: { id } });
  if (!existing) throw notFound("Offer not found");

  const offer = await db.offer.update({
    where: { id },
    data: {
      ...body,
      validFrom: body.validFrom === undefined ? undefined : body.validFrom ? new Date(body.validFrom) : null,
      validTo: body.validTo === undefined ? undefined : body.validTo ? new Date(body.validTo) : null,
    },
  });
  return NextResponse.json({ offer });
});

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.offer.findUnique({ where: { id } });
  if (!existing) throw notFound("Offer not found");

  await db.offer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
