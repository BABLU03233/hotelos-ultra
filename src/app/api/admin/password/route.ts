import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";
import { adminChangePasswordSchema } from "@/lib/validation/admin";

/** Self-service: the logged-in platform admin can change their own password. */
export const PATCH = apiRoute(async (req: NextRequest) => {
  const session = requireAdminSession(req);
  const body = adminChangePasswordSchema.parse(await req.json());

  const admin = await prisma.platformAdmin.findUnique({ where: { id: session.adminId } });
  if (!admin) throw new ApiError(401, "Not authenticated");

  if (!(await verifyPassword(body.currentPassword, admin.passwordHash))) {
    throw new ApiError(400, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(body.newPassword);
  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { passwordHash } });

  return NextResponse.json({ success: true });
});
