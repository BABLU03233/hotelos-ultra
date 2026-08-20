import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { HANDOVER_REASON, returnToAiFields, takeOverFields } from "@/lib/crm/handover";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const handoverSchema = z.object({
  action: z.enum(["take_over", "return_to_ai"]),
  /**
   * On return_to_ai: what the receptionist wants Anushka to know. On
   * take_over: unused.
   *
   * Optional on purpose. Requiring a note would mean a receptionist in a hurry
   * either invents one or leaves the conversation in handover rather than
   * filling in a box — and a conversation stuck in handover is a guest getting
   * no replies at all, which is far worse than a missing note.
   */
  briefing: z.string().trim().max(2000).optional(),
});

/**
 * Move a conversation between Anushka and a person.
 *
 * A dedicated route rather than another field on PATCH /contacts/[id]: this
 * writes five fields that must move together, and one of them decides whether
 * a guest gets replies at all. A half-applied handover — aiPaused set but
 * handoverAt missing — is a conversation that silently un-pauses twelve hours
 * later underneath a receptionist. Keeping it behind one named action means
 * that state can only be written one way.
 */
export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { session, db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const { action, briefing } = handoverSchema.parse(await req.json());

  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) throw notFound("Contact not found");

  // Resolved to a name here and stored as plain text on the contact, because
  // the next receptionist reading "Taken over by Priya" needs it to still say
  // that after Priya leaves and her account is deleted.
  let byName: string | null = null;
  if (action === "take_over") {
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { name: true } });
    byName = user?.name ?? null;
  }

  const contact = await db.contact.update({
    where: { id },
    data:
      action === "take_over"
        ? takeOverFields(HANDOVER_REASON.MANUAL, byName)
        : returnToAiFields(briefing),
  });

  return NextResponse.json({ contact });
});
