import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { contactListQuerySchema } from "@/lib/validation/contact";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
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

  return NextResponse.json({ contacts });
});
