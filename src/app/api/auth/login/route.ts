import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";

export const POST = apiRoute(async (req: NextRequest) => {
  const body = loginSchema.parse(await req.json());

  // Email is unique *per tenant* (spec §4), but login happens before a
  // tenant is known — resolve by email alone. In the near term each real
  // person only has one HotelOS Ultra account, so the first match is
  // correct; a workspace-picker step would only be needed once the same
  // person legitimately staffs two hotels with the same email.
  const user = await prisma.user.findFirst({ where: { email: body.email } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = signSession({ userId: user.id, tenantId: user.tenantId, role: user.role });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
});
