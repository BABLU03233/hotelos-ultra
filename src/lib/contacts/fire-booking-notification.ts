/**
 * Deliberately narrower than `Pick<PrismaClient, ...>` — a tenant-scoped
 * `TenantDb` (see tenant.ts's `$extends` wrapper) and the raw `PrismaClient`
 * singleton have generic delegate method types that aren't structurally
 * assignable to each other even though both work identically at runtime, so
 * this shape only names the exact calls this function makes.
 */
interface NotifiableDb {
  staffNotification: {
    create(args: { data: { tenantId: string; contactId: string; type: "BOOKING"; reason: string } }): Promise<unknown>;
  };
  scheduledFollowUp: {
    updateMany(args: {
      where: { tenantId: string; contactId: string; status: "PENDING" };
      data: { status: "CANCELLED" };
    }): Promise<unknown>;
  };
}

/**
 * Shared by the manual CRM booking path (PATCH /api/contacts/[id], on a
 * transition into leadStatus BOOKED) and the automated AI-driven booking
 * path (complete-booking.ts) — creates the BOOKING-type StaffNotification
 * that renders as an insistent popup + flashing tab (see
 * notification-bell.tsx/attention-panel.tsx), and cancels any pending
 * follow-ups now moot since the guest just booked.
 *
 * Takes tenantId explicitly (not inferred from `db`) since callers pass
 * either a tenant-scoped TenantDb (auto-injects tenantId on create anyway)
 * or the raw prisma singleton (the AI pipeline resolves its own tenant from
 * the webhook, outside any per-request session) — explicit tenantId works
 * correctly either way.
 */
export async function fireBookingNotification(db: NotifiableDb, tenantId: string, contactId: string, reason: string): Promise<void> {
  await db.staffNotification.create({ data: { tenantId, contactId, type: "BOOKING", reason } });
  await db.scheduledFollowUp.updateMany({ where: { tenantId, contactId, status: "PENDING" }, data: { status: "CANCELLED" } });
}
