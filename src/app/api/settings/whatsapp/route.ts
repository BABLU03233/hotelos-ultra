import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireOwner, requireTenantDb } from "@/lib/auth/require-session";
import { encryptSecret } from "@/lib/crypto";
import { whatsappSettingsSchema } from "@/lib/validation/settings";

export const GET = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const [tenant, profile, roomCount] = await Promise.all([
    db.tenant.findUnique({ where: { id: session.tenantId } }),
    db.hotelProfile.findUnique({ where: { tenantId: session.tenantId }, select: { whatsappBookingFlowId: true } }),
    db.room.count(),
  ]);

  return NextResponse.json({
    connected: !!(tenant?.whatsappPhoneNumberId && tenant.whatsappAccessToken),
    phoneNumberId: tenant?.whatsappPhoneNumberId ?? null,
    wabaId: tenant?.whatsappWabaId ?? null,
    // Whether the in-WhatsApp booking calendar is live for this hotel, and
    // whether there's anything to put in it — the publish endpoint needs at
    // least one room, since the room list is baked in at publish time.
    bookingFlowId: profile?.whatsappBookingFlowId ?? null,
    roomCount,
  });
});

/** Owner-only: connect/update this tenant's WhatsApp Business Cloud API credentials. */
export const PUT = apiRoute(async (req: NextRequest) => {
  const session = requireOwner(req);
  const { db } = requireTenantDb(req);
  const body = whatsappSettingsSchema.parse(await req.json());

  await db.tenant.update({
    where: { id: session.tenantId },
    data: {
      whatsappPhoneNumberId: body.phoneNumberId,
      whatsappWabaId: body.wabaId,
      whatsappAccessToken: encryptSecret(body.accessToken),
    },
  });

  return NextResponse.json({ connected: true });
});
