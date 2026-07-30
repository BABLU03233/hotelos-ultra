import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { hashPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { DEFAULT_FOLLOW_UP_RULES } from "@/lib/follow-up-defaults";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { registerSchema } from "@/lib/validation/auth";

/**
 * Self-service tenant signup: creates a brand new hotel workspace with its
 * first OWNER user, a blank HotelProfile, and the spec's default follow-up
 * cadence (+1h reminder, +24h offer, +3d package, +7d last touch). This is
 * the "non-technical owner can go live in minutes" onboarding path.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const body = registerSchema.parse(await req.json());

  const baseSlug = slugify(body.hotelName) || "hotel";
  let slug = baseSlug;
  for (let i = 0; await prisma.tenant.findUnique({ where: { slug } }); i++) {
    slug = `${baseSlug}-${i + 2}`;
  }

  const existing = await prisma.user.findFirst({ where: { email: body.email } });
  if (existing) throw new ApiError(409, "That email is already in use");

  const passwordHash = await hashPassword(body.password);

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: body.hotelName,
        slug,
        hotelProfile: { create: { name: body.hotelName } },
        followUpRules: { create: DEFAULT_FOLLOW_UP_RULES },
      },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: body.ownerName,
        email: body.email,
        passwordHash,
        role: "OWNER",
      },
    });
    return { tenant, user };
  });

  const token = signSession({ userId: user.id, tenantId: tenant.id, role: user.role });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
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
