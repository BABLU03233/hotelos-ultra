import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { hashPassword } from "@/lib/auth/password";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { DEFAULT_FOLLOW_UP_RULES } from "@/lib/follow-up-defaults";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { adminCreateTenantSchema } from "@/lib/validation/admin";

export const GET = apiRoute(async (req: NextRequest) => {
  requireAdminSession(req);

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: { where: { role: "OWNER" }, take: 1, select: { name: true, email: true } },
      _count: { select: { users: true, contacts: true } },
    },
  });

  const bookedCounts = await prisma.contact.groupBy({
    by: ["tenantId"],
    where: { leadStatus: "BOOKED" },
    _count: { _all: true },
  });
  const bookedByTenant = new Map(bookedCounts.map((b) => [b.tenantId, b._count._all]));

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      subscriptionStatus: t.subscriptionStatus,
      planFeeInPaise: t.planFeeInPaise,
      createdAt: t.createdAt,
      owner: t.users[0] ?? null,
      staffCount: t._count.users,
      contactCount: t._count.contacts,
      bookedCount: bookedByTenant.get(t.id) ?? 0,
      whatsappConnected: !!(t.whatsappPhoneNumberId && t.whatsappAccessToken),
    })),
  });
});

/** Admin-initiated onboarding — spins up a brand new hotel workspace + owner login, same shape as self-service register. */
export const POST = apiRoute(async (req: NextRequest) => {
  requireAdminSession(req);
  const body = adminCreateTenantSchema.parse(await req.json());

  const baseSlug = slugify(body.hotelName) || "hotel";
  let slug = baseSlug;
  for (let i = 0; await prisma.tenant.findUnique({ where: { slug } }); i++) {
    slug = `${baseSlug}-${i + 2}`;
  }

  const existingUser = await prisma.user.findFirst({ where: { email: body.ownerEmail } });
  if (existingUser) throw new ApiError(409, "That owner email is already in use");

  const passwordHash = await hashPassword(body.ownerPassword);

  const tenant = await prisma.tenant.create({
    data: {
      name: body.hotelName,
      slug,
      hotelProfile: { create: { name: body.hotelName } },
      followUpRules: { create: DEFAULT_FOLLOW_UP_RULES },
      users: {
        create: { name: body.ownerName, email: body.ownerEmail, passwordHash, role: "OWNER" },
      },
    },
  });

  return NextResponse.json({ tenant }, { status: 201 });
});
