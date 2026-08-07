import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string; contactId: string }>;
}

/** Full chat transcript for one guest, from the platform-admin side — see contacts/route.ts for the list this links from. */
export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  requireAdminSession(req);
  const { id, contactId } = await ctx.params;

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.tenantId !== id) throw notFound("Contact not found");

  const messages = await prisma.message.findMany({
    where: { tenantId: id, contactId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ contact, messages });
});
