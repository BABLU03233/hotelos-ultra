import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { roomSchema } from "@/lib/validation/settings";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const rooms = await db.room.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ rooms });
});

export const POST = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const body = roomSchema.parse(await req.json());
  // Same Json handling as the PATCH route: a plain array cannot go through a
  // spread into a Json column.
  const { occupancyPrices, ...rest } = body;
  const room = await db.room.create({
    data: {
      ...rest,
      amenities: body.amenities ?? [],
      imageUrls: body.imageUrls ?? [],
      tenantId: session.tenantId,
      ...(occupancyPrices ? { occupancyPrices: occupancyPrices as Prisma.InputJsonValue } : {}),
    },
  });
  return NextResponse.json({ room }, { status: 201 });
});
