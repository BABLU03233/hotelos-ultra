import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireOwner } from "@/lib/auth/require-session";
import { tenantDb } from "@/lib/tenant";

/**
 * Owner-only, irreversible: wipes every contact for this hotel — and
 * everything that cascades off one (messages, bookings, follow-ups, staff
 * notifications, campaign recipients) — plus the campaigns themselves, so
 * a hotel that only ever sent test broadcasts can start clean.
 *
 * tenantDb merges tenantId into every query regardless of what's passed, so
 * this can never reach another hotel's rows no matter what the caller sends
 * — see src/lib/tenant-scope.ts. The `confirm` field is a guard against an
 * accidental call (stray retry, resubmitted form), not a security boundary;
 * requireOwner is what actually gates this.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const session = requireOwner(req);
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") {
    throw new ApiError(400, 'Send { "confirm": "DELETE" } to proceed — this cannot be undone.');
  }

  const db = tenantDb(session.tenantId);
  const [{ count: campaignsDeleted }, { count: contactsDeleted }] = await db.$transaction([
    db.campaign.deleteMany({}),
    db.contact.deleteMany({}),
  ]);

  return NextResponse.json({ campaignsDeleted, contactsDeleted });
});
