import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { contactListQuerySchema } from "@/lib/validation/contact";

export const GET = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const { searchParams } = new URL(req.url);
  const query = contactListQuerySchema.parse({
    leadStatus: searchParams.get("leadStatus") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  const contacts = await db.contact.findMany({
    where: {
      leadStatus: query.leadStatus,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
              { whatsappNumber: { contains: query.search } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  // A real WhatsApp-style unread count, not just a boolean dot — counts
  // inbound messages newer than each contact's own lastReadAt. The
  // threshold varies per contact, so this needs a join rather than a
  // single groupBy; tenantId scoped explicitly since raw queries bypass
  // the tenant-scoping extension entirely.
  const unreadRows = await prisma.$queryRaw<{ contactId: string; count: bigint }[]>`
    SELECT m."contactId", COUNT(*) as count
    FROM "Message" m
    JOIN "Contact" c ON c.id = m."contactId"
    WHERE m."tenantId" = ${session.tenantId}
      AND m.direction = 'IN'
      AND (c."lastReadAt" IS NULL OR m."createdAt" > c."lastReadAt")
    GROUP BY m."contactId"
  `;
  const unreadByContact = new Map(unreadRows.map((r) => [r.contactId, Number(r.count)]));

  return NextResponse.json({
    contacts: contacts.map((c) => ({ ...c, unreadCount: unreadByContact.get(c.id) ?? 0 })),
  });
});
