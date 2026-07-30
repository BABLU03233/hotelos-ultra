import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

export const GET = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId } });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
  });
});
