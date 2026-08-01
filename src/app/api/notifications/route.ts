import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);

  const notifications = await db.staffNotification.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { contact: { select: { id: true, name: true, phone: true } } },
  });

  return NextResponse.json({ notifications });
});
