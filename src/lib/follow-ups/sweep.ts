import { decideFollowUpAction } from "./decide";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

const BATCH_SIZE = 50;

/**
 * Sends every ScheduledFollowUp that's come due and is still PENDING.
 * Called on a fixed interval by the worker process (src/worker/index.ts) —
 * a plain polling sweep rather than one BullMQ job per follow-up, so
 * cancelling (guest replied — see handleInboundMessage) is just a DB write,
 * no need to keep a delayed queue job's id in sync with row state.
 */
export async function sweepDueFollowUps(now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
  const due = await prisma.scheduledFollowUp.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: BATCH_SIZE,
    include: { contact: true, rule: true },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const scheduled of due) {
    const { contact, rule } = scheduled;

    const decision = decideFollowUpAction(
      { ruleActive: rule.active, ruleTemplateName: rule.templateName, leadStatus: contact.leadStatus, lastInboundAt: contact.lastInboundAt },
      now
    );

    if (decision.type === "cancel") {
      await prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "CANCELLED" } });
      continue;
    }
    if (decision.type === "skip") {
      await prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "SKIPPED" } });
      skipped++;
      continue;
    }

    const withinWindow = decision.withinWindow;
    const creds = await getWhatsAppCredentials(scheduled.tenantId);
    if (!creds) {
      failed++;
      continue;
    }

    try {
      const whatsappMessageId = withinWindow
        ? await sendWhatsAppMessage(creds, contact.whatsappNumber, {
            type: "text",
            text: rule.messageBody || "Just checking in — still interested in booking with us?",
          })
        : await sendWhatsAppMessage(creds, contact.whatsappNumber, {
            type: "template",
            templateName: rule.templateName!,
          });

      await prisma.$transaction([
        prisma.message.create({
          data: {
            tenantId: scheduled.tenantId,
            contactId: contact.id,
            direction: "OUT",
            type: withinWindow ? "TEXT" : "TEMPLATE",
            content: withinWindow ? rule.messageBody : `[template: ${rule.templateName}]`,
            whatsappMessageId,
            status: "SENT",
          },
        }),
        prisma.contact.update({
          where: { id: contact.id },
          data: {
            lastMessage: withinWindow ? rule.messageBody : `[template: ${rule.templateName}]`,
            leadStatus: contact.leadStatus === "NEW" ? "FOLLOW_UP" : contact.leadStatus,
          },
        }),
        prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "SENT" } }),
      ]);
      sent++;
    } catch (err) {
      console.error(`Follow-up send failed for contact ${contact.id}:`, err);
      failed++;
    }
  }

  return { sent, skipped, failed };
}
