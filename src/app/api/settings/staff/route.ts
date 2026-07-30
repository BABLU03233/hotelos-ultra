import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireOwner, requireTenantDb } from "@/lib/auth/require-session";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { staffInviteSchema } from "@/lib/validation/settings";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const staff = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json({ staff });
});

/** Owner-only: add a new staff login to this hotel's workspace. */
export const POST = apiRoute(async (req: NextRequest) => {
  const session = requireOwner(req);
  const body = staffInviteSchema.parse(await req.json());

  const clash = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: session.tenantId, email: body.email } },
  });
  if (clash) throw new ApiError(409, "That email is already a staff member here");

  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: { tenantId: session.tenantId, name: body.name, email: body.email, passwordHash, role: body.role },
  });

  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    { status: 201 }
  );
});
