import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) throw notFound("Contact not found");

  const messages = await db.message.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ messages });
});
