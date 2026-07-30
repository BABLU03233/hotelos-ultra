import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireSession } from "@/lib/auth/require-session";
import { getDashboardMetrics } from "@/lib/dashboard/get-metrics";

export const GET = apiRoute(async (req: NextRequest) => {
  const session = requireSession(req);
  const metrics = await getDashboardMetrics(session.tenantId);
  return NextResponse.json(metrics);
});
