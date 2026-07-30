import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { offerSchema } from "@/lib/validation/settings";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const offers = await db.offer.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ offers });
});

export const POST = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const body = offerSchema.parse(await req.json());
  const offer = await db.offer.create({
    data: {
      ...body,
      validFrom: body.validFrom ? new Date(body.validFrom) : null,
      validTo: body.validTo ? new Date(body.validTo) : null,
      tenantId: session.tenantId,
    },
  });
  return NextResponse.json({ offer }, { status: 201 });
});
