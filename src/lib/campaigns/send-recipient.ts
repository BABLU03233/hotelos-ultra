import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";
import { isWithin24HourWindow } from "@/lib/whatsapp/window";
import { BodyVariableSlot, buildTemplateComponents } from "@/lib/whatsapp/template-variables";

/** Runs inside the BullMQ worker for the campaign-send queue — one job per recipient. */
export async function sendCampaignToRecipient(campaignRecipientId: string): Promise<void> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: campaignRecipientId },
    include: { campaign: { include: { metaTemplate: true } }, contact: true },
  });
  if (!recipient || recipient.status !== "PENDING") return;

  const { campaign, contact } = recipient;

  // Required under WhatsApp's Business Messaging Policy — a guest who
  // opted out (STOP or the "Stop promos" button) never gets another
  // broadcast, regardless of pacing/scheduling.
  if (contact.optedOutAt) {
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "CANCELLED" } });
    return;
  }

  // Free-form text/image campaigns can only reach contacts inside the 24h
  // window; template campaigns work regardless (that's what templates are
  // for) — this is exactly the "respecting... the template rule" guardrail.
  if (campaign.messageType !== "TEMPLATE" && !isWithin24HourWindow(contact.lastInboundAt)) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "FAILED",
        // Named precisely, because this is the failure the owner will actually
        // hit and the fix is not obvious. Observed live: a broadcast reported
        // "Sent" with both recipients silently failed here, because neither
        // had ever messaged the hotel.
        failureReason: contact.lastInboundAt
          ? "Outside WhatsApp's 24-hour window — they last messaged you more than 24h ago. Use an approved template to reach them."
          : "This contact has never messaged you, so WhatsApp only allows an approved template — not a free-text or image broadcast.",
      },
    });
    return;
  }

  const creds = await getWhatsAppCredentials(campaign.tenantId);
  if (!creds) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "FAILED", failureReason: "WhatsApp isn't connected for this hotel — reconnect it in Settings." },
    });
    return;
  }

  const hotelProfile =
    campaign.messageType === "TEMPLATE" && campaign.metaTemplate
      ? await prisma.hotelProfile.findUnique({ where: { tenantId: campaign.tenantId } })
      : null;

  try {
    const whatsappMessageId = await sendWhatsAppMessage(
      creds,
      contact.whatsappNumber,
      buildOutboundMessage(campaign, contact, hotelProfile)
    );

    await prisma.$transaction([
      prisma.message.create({
        data: {
          tenantId: campaign.tenantId,
          contactId: contact.id,
          direction: "OUT",
          type: campaign.messageType === "IMAGE" ? "IMAGE" : campaign.messageType === "TEMPLATE" ? "TEMPLATE" : "TEXT",
          content: campaign.body ?? `[template: ${campaign.metaTemplate?.name ?? campaign.templateName}]`,
          mediaUrl: campaign.mediaUrl,
          whatsappMessageId,
          campaignRecipientId: recipient.id,
          status: "SENT",
        },
      }),
      prisma.contact.update({
        where: { id: contact.id },
        data: { lastMessage: campaign.body ?? `[campaign: ${campaign.name}]` },
      }),
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", sentAt: new Date() },
      }),
    ]);
  } catch (err) {
    console.error(`Campaign send failed for recipient ${recipient.id}:`, err);
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      // Meta's own message, kept verbatim and capped. It names the real
      // problem ("template not approved", "re-engagement required") far more
      // precisely than anything that could be guessed from the outside.
      data: {
        status: "FAILED",
        failureReason: (err instanceof Error ? err.message : "The message could not be sent.").slice(0, 500),
      },
    });
  }
}

function buildOutboundMessage(
  campaign: {
    messageType: string;
    body: string | null;
    mediaUrl: string | null;
    templateName: string | null;
    templateVariableValues: unknown;
    metaTemplate: { name: string; language: string; bodyVariableSlots: unknown } | null;
  },
  contact: { name: string | null },
  hotelProfile: { name: string } | null
) {
  if (campaign.messageType === "TEMPLATE") {
    if (campaign.metaTemplate) {
      const components = buildTemplateComponents(
        (campaign.metaTemplate.bodyVariableSlots as BodyVariableSlot[]) ?? [],
        contact,
        hotelProfile,
        (campaign.templateVariableValues as Record<string, string>) ?? {}
      );
      return {
        type: "template" as const,
        templateName: campaign.metaTemplate.name,
        languageCode: campaign.metaTemplate.language,
        components,
      };
    }
    // Legacy path: a free-text template name typed in before this app tracked real templates.
    return { type: "template" as const, templateName: campaign.templateName! };
  }
  if (campaign.messageType === "IMAGE" && campaign.mediaUrl) {
    return { type: "image" as const, link: campaign.mediaUrl, caption: campaign.body ?? undefined };
  }
  return { type: "text" as const, text: campaign.body ?? "" };
}
