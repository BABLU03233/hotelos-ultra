import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireOwner } from "@/lib/auth/require-session";
import { verifyCredentials } from "@/lib/whatsapp/client";
import { whatsappSettingsSchema } from "@/lib/validation/settings";

/** Owner-only: validates a phone_number_id/access token pair against the real Graph API before it's saved. */
export const POST = apiRoute(async (req: NextRequest) => {
  requireOwner(req);
  const body = whatsappSettingsSchema.pick({ phoneNumberId: true, accessToken: true }).parse(await req.json());

  try {
    const result = await verifyCredentials(body);
    return NextResponse.json(result);
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : "Couldn't verify these credentials");
  }
});
