import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { fireBookingNotification } from "@/lib/contacts/fire-booking-notification";
import { contactUpdateSchema } from "@/lib/validation/contact";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const contact = await db.contact.findUnique({ where: { id }, include: { assignedTo: { select: { id: true, name: true } } } });
  if (!contact) throw notFound("Contact not found");

  return NextResponse.json({ contact });
});

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const { markRead, ...body } = contactUpdateSchema.parse(await req.json());

  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) throw notFound("Contact not found");

  const contact = await db.contact.update({
    where: { id },
    data: {
      ...body,
      followUpDate: body.followUpDate === undefined ? undefined : body.followUpDate ? new Date(body.followUpDate) : null,
      lastReadAt: markRead ? new Date() : undefined,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  // Leaving BOOKED/CLOSED behind (someone reopened the lead) doesn't need
  // special handling; entering either state means no more nurture is
  // needed, so cancel anything still pending.
  if (body.leadStatus === "BOOKED" || body.leadStatus === "CLOSED") {
    await db.scheduledFollowUp.updateMany({
      where: { contactId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  }

  // Only on the actual transition into BOOKED (not every save while it's
  // already booked) — surfaced as a more insistent popup + flashing tab
  // title on the dashboard (see notification-bell.tsx/attention-panel.tsx),
  // not just the passive resolved/unresolved list.
  if (body.leadStatus === "BOOKED" && existing.leadStatus !== "BOOKED") {
    await fireBookingNotification(db, existing.tenantId, id, `${contact.name || contact.phone} just booked! 🎉`);
  }

  return NextResponse.json({ contact });
});
