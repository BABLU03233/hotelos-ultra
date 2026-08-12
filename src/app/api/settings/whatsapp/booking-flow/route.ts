import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireOwner } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { deprecateFlow, publishBookingFlow } from "@/lib/whatsapp/flows/publish-flow";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

/**
 * Owner-only: publishes this hotel's booking Flow — the native in-WhatsApp
 * date-range calendar and room picker — to Meta, and stores the resulting
 * Flow id so `handle-inbound-message.ts` starts sending it.
 *
 * Until this route existed, `HotelProfile.whatsappBookingFlowId` was read in
 * two places and written in none, which made the whole calendar unreachable:
 * the "Book a room" tap always fell through to the step-by-step waterfall
 * because the id was always null.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const session = requireOwner(req);

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) {
    throw new ApiError(400, "Connect WhatsApp first (Settings → WhatsApp) — publishing a Flow needs this hotel's own access token.");
  }

  // The room list is baked into the Flow at publish time (it's a static
  // Flow, no hosted data endpoint), so this snapshot is what guests will
  // see until it's published again — worth stating plainly in the response.
  const rooms = await prisma.room.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { price: "asc" },
    select: { id: true, name: true, price: true },
  });
  if (!rooms.length) {
    throw new ApiError(400, "Add at least one room in Settings → Rooms before publishing the booking calendar.");
  }

  const existing = await prisma.hotelProfile.findUnique({
    where: { tenantId: session.tenantId },
    select: { whatsappBookingFlowId: true },
  });

  let flowId: string;
  try {
    flowId = await publishBookingFlow(creds, rooms);
  } catch (err) {
    // Meta's own message is far more actionable than anything generic —
    // it names the exact component or permission at fault.
    throw new ApiError(400, err instanceof Error ? err.message : "Publishing the booking calendar failed.");
  }

  await prisma.hotelProfile.update({
    where: { tenantId: session.tenantId },
    data: { whatsappBookingFlowId: flowId },
  });

  // Only after the new Flow is live and stored: a published Flow can't be
  // edited, so replacing one means publishing a new one and retiring the
  // old. Deprecating first would leave a window with no working calendar,
  // and deprecation failing is never worth failing the publish over.
  if (existing?.whatsappBookingFlowId && existing.whatsappBookingFlowId !== flowId) {
    await deprecateFlow(creds, existing.whatsappBookingFlowId);
  }

  return NextResponse.json({ flowId, roomCount: rooms.length });
});
