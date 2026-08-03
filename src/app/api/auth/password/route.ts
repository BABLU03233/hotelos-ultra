import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireTenantDb } from "@/lib/auth/require-session";
import { changePasswordSchema } from "@/lib/validation/auth";

/** Self-service: any authenticated tenant user (owner or staff) can change their own password. */
export const PATCH = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const body = changePasswordSchema.parse(await req.json());

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new ApiError(401, "Not authenticated");

  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(body.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ success: true });
});
