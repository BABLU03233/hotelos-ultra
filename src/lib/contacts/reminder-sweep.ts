import { prisma } from "@/lib/prisma";

/**
 * Picks up contacts whose manually-scheduled followUpDate (calendar picker
 * in the CRM, separate from the automated FollowUpRule ladder — see
 * contact-detail.tsx) has come due, and creates a REMINDER-type
 * StaffNotification so staff know to personally reach out. Deliberately
 * a human nudge, not an automatic WhatsApp send — a one-off manual
 * follow-up usually needs personal context an auto-composed message
 * can't provide. Clears both fields after firing so it only reminds once.
 */
export async function sweepDueFollowUpReminders(now = new Date()): Promise<number> {
  const due = await prisma.contact.findMany({
    where: { followUpDate: { lte: now } },
    select: { id: true, tenantId: true, name: true, phone: true, followUpNote: true },
  });

  for (const contact of due) {
    await prisma.$transaction([
      prisma.staffNotification.create({
        data: {
          tenantId: contact.tenantId,
          contactId: contact.id,
          type: "REMINDER",
          reason: contact.followUpNote
            ? `Scheduled follow-up: ${contact.followUpNote}`
            : `Scheduled follow-up with ${contact.name || contact.phone}`,
        },
      }),
      prisma.contact.update({
        where: { id: contact.id },
        data: { followUpDate: null, followUpNote: null },
      }),
    ]);
  }

  return due.length;
}
