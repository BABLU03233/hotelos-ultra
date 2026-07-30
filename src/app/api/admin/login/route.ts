import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { signAdminSession } from "@/lib/auth/admin-jwt";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin-session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { adminLoginSchema } from "@/lib/validation/admin";

export const POST = apiRoute(async (req: NextRequest) => {
  const body = adminLoginSchema.parse(await req.json());

  const admin = await prisma.platformAdmin.findUnique({ where: { email: body.email } });
  if (!admin || !(await verifyPassword(body.password, admin.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = signAdminSession({ adminId: admin.id });

  const res = NextResponse.json({ admin: { id: admin.id, name: admin.name, email: admin.email } });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
});
