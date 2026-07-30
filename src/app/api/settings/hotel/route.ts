import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { hotelProfileSchema } from "@/lib/validation/settings";

export const GET = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const profile = await db.hotelProfile.findUnique({ where: { tenantId: session.tenantId } });
  return NextResponse.json({ profile });
});

export const PUT = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const body = hotelProfileSchema.parse(await req.json());

  const profile = await db.hotelProfile.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, ...body },
    update: body,
  });

  return NextResponse.json({ profile });
});
