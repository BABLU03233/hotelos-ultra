import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireOwner, requireTenantDb } from "@/lib/auth/require-session";
import { encryptSecret } from "@/lib/crypto";
import { whatsappSettingsSchema } from "@/lib/validation/settings";

export const GET = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId } });

  return NextResponse.json({
    connected: !!(tenant?.whatsappPhoneNumberId && tenant.whatsappAccessToken),
    phoneNumberId: tenant?.whatsappPhoneNumberId ?? null,
    wabaId: tenant?.whatsappWabaId ?? null,
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
