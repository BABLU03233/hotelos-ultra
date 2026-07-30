import { ChatMessage } from "@/lib/ai/provider";
import { generateReply, summarizeConversation } from "@/lib/ai/pipeline";
import { ProcessMessageJob } from "@/lib/queue/queues";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

const HISTORY_LIMIT = 12;

async function scheduleFollowUps(tenantId: string, contactId: string): Promise<void> {
  await prisma.scheduledFollowUp.updateMany({
    where: { tenantId, contactId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const rules = await prisma.followUpRule.findMany({ where: { tenantId, active: true } });
  if (!rules.length) return;

  const now = Date.now();
  await prisma.scheduledFollowUp.createMany({
    data: rules.map((rule) => ({
      tenantId,
      contactId,
      ruleId: rule.id,
      runAt: new Date(now + rule.delayMinutes * 60_000),
      status: "PENDING" as const,
    })),
  });
}

/** Runs inside the BullMQ worker (src/worker/index.ts) for the message-processing queue. */
export async function processMessageJob(job: ProcessMessageJob): Promise<void> {
  const { tenantId, contactId } = job;

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.tenantId !== tenantId) return;

  // Staff has taken this conversation over manually — the AI stays silent
  // until they hand it back (M3: "pauses AI for that contact").
  if (contact.aiPaused) return;

  const recentMessages = await prisma.message.findMany({
    where: { tenantId, contactId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const chronological = [...recentMessages].reverse();
  const latestInbound = chronological.filter((m) => m.direction === "IN").at(-1);
  if (!latestInbound?.content) return; // nothing textual to react to (e.g. an image with no caption)

  const history: ChatMessage[] = chronological
    .filter((m) => m.id !== latestInbound.id && m.content)
    .map((m) => ({ role: m.direction === "IN" ? "user" : "assistant", content: m.content! }));

  const { reply, shouldEscalate, escalationReason } = await generateReply(tenantId, latestInbound.content, history);

  const creds = await getWhatsAppCredentials(tenantId);
  if (!creds) {
    console.warn(`Tenant ${tenantId} has no WhatsApp credentials configured — cannot send AI reply.`);
    return;
  }

  const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text: reply });

  await prisma.message.create({
    data: {
      tenantId,
      contactId,
      direction: "OUT",
      type: "TEXT",
      content: reply,
      whatsappMessageId,
      status: "SENT",
    },
  });

  if (shouldEscalate) {
    await prisma.staffNotification.create({
      data: { tenantId, contactId, reason: escalationReason || "Aria couldn't answer confidently" },
    });
  }

  const summary = await summarizeConversation([...history, { role: "user", content: latestInbound.content }, { role: "assistant", content: reply }]).catch(
    () => contact.aiSummary ?? ""
  );

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      lastMessage: reply,
      aiSummary: summary,
      leadStatus: contact.leadStatus === "NEW" ? "INTERESTED" : contact.leadStatus,
    },
  });

  if (contact.leadStatus !== "BOOKED" && contact.leadStatus !== "CLOSED") {
    await scheduleFollowUps(tenantId, contactId);
  }
}
