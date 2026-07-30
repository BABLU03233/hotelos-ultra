import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";
import { contactReplySchema } from "@/lib/validation/contact";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * A staff member replying manually from the CRM — pauses the AI for this
 * contact (M3: "which pauses AI for that contact until re-enabled") and
 * cancels any pending automated follow-ups, since a human is now driving
 * the conversation directly.
 */
export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { session, db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const { text } = contactReplySchema.parse(await req.json());

  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) throw notFound("Contact not found");

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) throw new ApiError(400, "Connect WhatsApp in Settings before replying");

  const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text });

  const [message] = await db.$transaction([
    db.message.create({
      data: {
        tenantId: session.tenantId,
        contactId: id,
        direction: "OUT",
        type: "TEXT",
        content: text,
        senderUserId: session.userId,
        whatsappMessageId,
        status: "SENT",
      },
    }),
    db.contact.update({ where: { id }, data: { lastMessage: text, aiPaused: true } }),
    db.scheduledFollowUp.updateMany({ where: { contactId: id, status: "PENDING" }, data: { status: "CANCELLED" } }),
  ]);

  return NextResponse.json({ message });
});
