import { decideFollowUpAction } from "./decide";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";
import { BodyVariableSlot, buildTemplateComponents } from "@/lib/whatsapp/template-variables";

const BATCH_SIZE = 50;
const REPEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
    include: { contact: true, rule: { include: { metaTemplate: true } } },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const scheduled of due) {
    const { contact, rule } = scheduled;

    // Required under WhatsApp's Business Messaging Policy — a guest who
    // opted out never gets another follow-up nudge. Cancel outright (not
    // "skip") so a repeatDaily rule doesn't just re-arm itself 24h later.
    if (contact.optedOutAt) {
      await prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "CANCELLED" } });
      continue;
    }

    const effectiveTemplateName = rule.metaTemplate?.name ?? rule.templateName;
    const decision = decideFollowUpAction(
      { ruleActive: rule.active, ruleTemplateName: effectiveTemplateName, leadStatus: contact.leadStatus, lastInboundAt: contact.lastInboundAt },
      now
    );

    if (decision.type === "cancel") {
      await prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "CANCELLED" } });
      continue;
    }
    if (decision.type === "skip") {
      await prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "SKIPPED" } });
      skipped++;
      if (rule.repeatDaily) {
        await prisma.scheduledFollowUp.create({
          data: {
            tenantId: scheduled.tenantId,
            contactId: contact.id,
            ruleId: rule.id,
            runAt: new Date(now.getTime() + REPEAT_INTERVAL_MS),
            status: "PENDING",
          },
        });
      }
      continue;
    }

    const withinWindow = decision.withinWindow;
    const creds = await getWhatsAppCredentials(scheduled.tenantId);
    if (!creds) {
      // Without this, the row stays PENDING forever and gets re-picked-up
      // by every future sweep — an infinite retry loop for a condition
      // retrying can never fix. WhatsApp connection status is already
      // surfaced in Settings/admin, so treat this the same as the
      // can't-send-in-this-window case rather than paging staff per lead.
      await prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "SKIPPED" } });
      failed++;
      continue;
    }

    try {
      let whatsappMessageId: string;
      if (withinWindow) {
        whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, {
          type: "text",
          text: rule.messageBody || "Just checking in — still interested in booking with us?",
        });
      } else if (rule.metaTemplate) {
        const hotelProfile = await prisma.hotelProfile.findUnique({ where: { tenantId: scheduled.tenantId } });
        const components = buildTemplateComponents(
          (rule.metaTemplate.bodyVariableSlots as unknown as BodyVariableSlot[]) ?? [],
          contact,
          hotelProfile,
          (rule.templateVariableValues as unknown as Record<string, string>) ?? {}
        );
        whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, {
          type: "template",
          templateName: rule.metaTemplate.name,
          languageCode: rule.metaTemplate.language,
          components,
        });
      } else {
        whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, {
          type: "template",
          templateName: rule.templateName!,
        });
      }

      await prisma.$transaction([
        prisma.message.create({
          data: {
            tenantId: scheduled.tenantId,
            contactId: contact.id,
            direction: "OUT",
            type: withinWindow ? "TEXT" : "TEMPLATE",
            content: withinWindow ? rule.messageBody : `[template: ${effectiveTemplateName}]`,
            whatsappMessageId,
            status: "SENT",
          },
        }),
        prisma.contact.update({
          where: { id: contact.id },
          data: {
            lastMessage: withinWindow ? rule.messageBody : `[template: ${effectiveTemplateName}]`,
            leadStatus: contact.leadStatus === "NEW" ? "FOLLOW_UP" : contact.leadStatus,
          },
        }),
        prisma.scheduledFollowUp.update({ where: { id: scheduled.id }, data: { status: "SENT" } }),
        ...(rule.repeatDaily
          ? [
              prisma.scheduledFollowUp.create({
                data: {
                  tenantId: scheduled.tenantId,
                  contactId: contact.id,
                  ruleId: rule.id,
                  runAt: new Date(now.getTime() + REPEAT_INTERVAL_MS),
                  status: "PENDING" as const,
                },
              }),
            ]
          : []),
      ]);
      sent++;
    } catch (err) {
      console.error(`Follow-up send failed for contact ${contact.id}:`, err);
      failed++;
    }
  }

  return { sent, skipped, failed };
}
