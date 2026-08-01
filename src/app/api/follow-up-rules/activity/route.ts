import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);

  const activity = await db.scheduledFollowUp.findMany({
    where: { status: { in: ["SENT", "SKIPPED", "CANCELLED"] } },
    orderBy: { runAt: "desc" },
    take: 50,
    include: {
      rule: { select: { action: true } },
      contact: { select: { id: true, name: true, phone: true } },
    },
  });

  return NextResponse.json({ activity });
});
