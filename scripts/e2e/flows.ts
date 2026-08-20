/**
 * Scenarios that are not conversations.
 *
 * The rest of the suite drives WhatsApp turns and asserts on what the guest
 * received. Some behaviour has no guest turn at all — a campaign approval gate
 * lives entirely between the owner's dashboard, the operator's queue and the
 * send worker — and skipping it because it does not fit the harness's shape is
 * how the highest-blast-radius path in the app ends up as the only untested
 * one.
 *
 * A flow gets the same throwaway hotel as a conversational scenario and asserts
 * against the database directly.
 */

export interface FlowCheck {
  label: string;
  passed: boolean;
}

export interface Flow {
  id: string;
  area: string;
  title: string;
  /** Why this case exists — printed in the report so a failure explains itself. */
  because: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches the fixture's generic Prisma handle */
  run: (ctx: { prisma: any; tenantId: string }) => Promise<FlowCheck[]>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- as above */

// A counter, not a timestamp: `Date.now()` truncated to a WhatsApp-length
// number repeats when two contacts are seeded in the same millisecond, which
// trips the (tenantId, whatsappNumber) unique constraint.
let seedCounter = 0;

/** Creates a campaign row directly, standing in for the owner's create dialog. */
async function seedCampaign(prisma: any, tenantId: string, over: Record<string, unknown> = {}) {
  const number = `95550${String(seedCounter++).padStart(6, "0")}`;
  const contact = await prisma.contact.create({
    data: { tenantId, whatsappNumber: number, phone: number, name: "Campaign Target" },
  });
  return prisma.campaign.create({
    data: {
      tenantId,
      name: "Monsoon offer",
      type: "monsoon-offer",
      messageType: "TEXT",
      body: "Rooms from ₹999 this monsoon. Reply STOP to opt out.",
      approval: "PENDING_REVIEW",
      submittedAt: new Date(),
      recipients: { create: [{ contactId: contact.id }] },
      ...over,
    },
  });
}

export const FLOWS: Flow[] = [
  {
    id: "campaign-approval-gate",
    area: "campaigns",
    title: "An unapproved campaign cannot be sent",
    because:
      "A broadcast reaches every recipient at once and cannot be recalled. If the gate leaks, the review step is decoration.",
    async run({ prisma, tenantId }) {
      const { queueCampaignSend, CampaignNotApprovedError } = await import("@/lib/campaigns/send");
      const checks: FlowCheck[] = [];

      const pending = await seedCampaign(prisma, tenantId);
      let refused = false;
      let refusedWithTypedError = false;
      try {
        await queueCampaignSend(pending.id);
      } catch (err) {
        refused = true;
        refusedWithTypedError = err instanceof CampaignNotApprovedError;
      }
      checks.push({ label: "a PENDING_REVIEW campaign is refused", passed: refused });
      checks.push({ label: "refusal is a typed error, so routes can answer 409", passed: refusedWithTypedError });

      const afterRefusal = await prisma.campaign.findUnique({ where: { id: pending.id } });
      checks.push({ label: "the refused campaign is not marked sent", passed: afterRefusal.sentAt === null });
      const moved = await prisma.campaignRecipient.count({
        where: { campaignId: pending.id, status: { not: "PENDING" } },
      });
      checks.push({ label: "no recipient moved out of PENDING", passed: moved === 0 });

      const rejected = await seedCampaign(prisma, tenantId, { approval: "REJECTED", reviewNote: "Too pushy." });
      let rejectedRefused = false;
      try {
        await queueCampaignSend(rejected.id);
      } catch {
        rejectedRefused = true;
      }
      checks.push({ label: "a REJECTED campaign is refused too", passed: rejectedRefused });

      const approved = await seedCampaign(prisma, tenantId, { approval: "APPROVED", reviewedAt: new Date() });
      let sentCount = 0;
      let sendError: unknown = null;
      try {
        sentCount = await queueCampaignSend(approved.id);
      } catch (err) {
        sendError = err;
      }
      checks.push({ label: "an APPROVED campaign sends", passed: !sendError && sentCount === 1 });

      const afterSend = await prisma.campaign.findUnique({ where: { id: approved.id } });
      checks.push({ label: "the approved campaign is stamped sentAt", passed: afterSend.sentAt !== null });

      return checks;
    },
  },
  {
    id: "campaign-scheduled-sweep-respects-approval",
    area: "campaigns",
    title: "The scheduled-send sweep skips unapproved campaigns",
    because:
      "The sweep runs unattended on a timer. An approval gate the owner's Send button honours but the 3am sweep ignores is not a gate at all.",
    async run({ prisma, tenantId }) {
      const { sweepDueCampaigns } = await import("@/lib/campaigns/send");
      const checks: FlowCheck[] = [];
      const past = new Date(Date.now() - 60_000);

      const held = await seedCampaign(prisma, tenantId, { scheduledAt: past, approval: "PENDING_REVIEW" });
      // Asserted on THIS campaign's row, not on the sweep's return count: the
      // sweep is cross-tenant, and a leftover campaign in the local dev
      // database would otherwise decide whether this test passes.
      await sweepDueCampaigns();

      const stillHeld = await prisma.campaign.findUnique({ where: { id: held.id } });
      checks.push({ label: "a due-but-unapproved campaign is not sent", passed: stillHeld.sentAt === null });
      // It must still be waiting, not silently dropped — approving it later has
      // to be enough to make it go out.
      checks.push({ label: "its schedule is left intact for after approval", passed: stillHeld.scheduledAt !== null });

      await prisma.campaign.update({ where: { id: held.id }, data: { approval: "APPROVED", reviewedAt: new Date() } });
      await sweepDueCampaigns();

      const afterApproval = await prisma.campaign.findUnique({ where: { id: held.id } });
      checks.push({ label: "once approved, the next sweep sends it", passed: afterApproval.sentAt !== null });

      return checks;
    },
  },
  {
    id: "booking-hands-over-to-a-human",
    area: "handover",
    title: "A completed booking hands the chat to a person",
    because:
      "Everything after a booking — payment, ID, arrival time — is work Anushka is forbidden from doing. Left in charge, the one conversation that already produced revenue is the one nobody is watching.",
    async run({ prisma, tenantId }) {
      const { completeBooking } = await import("@/lib/booking/complete-booking");
      const { conversationMode } = await import("@/lib/crm/handover");
      const { isPauseStale } = await import("@/lib/inbound/ai-pause");
      const checks: FlowCheck[] = [];

      const number = `95551${String(seedCounter++).padStart(6, "0")}`;
      const contact = await prisma.contact.create({
        data: { tenantId, whatsappNumber: number, phone: number, name: "Booking Guest", leadStatus: "INTERESTED" },
      });

      const before = await prisma.contact.findUnique({ where: { id: contact.id } });
      checks.push({ label: "before booking, the AI is answering", passed: conversationMode(before) === "ai" });

      await completeBooking(prisma, tenantId, contact.id);

      const after = await prisma.contact.findUnique({ where: { id: contact.id } });
      checks.push({ label: "after booking, a human holds the chat", passed: conversationMode(after) === "human" });
      checks.push({ label: "aiPaused is set, so the inbound pipeline stays quiet", passed: after.aiPaused === true });
      checks.push({ label: "the reason is recorded for the next shift", passed: Boolean(after.handoverReason) });

      // The bug this exists to prevent: the 12h auto-expiry firing on a
      // deliberate handover and putting Anushka back into a settled booking.
      const thirtyHoursLater = new Date(Date.now() + 30 * 3_600_000);
      checks.push({
        label: "the handover does NOT expire after 12 hours",
        passed: isPauseStale(after, thirtyHoursLater) === false,
      });

      return checks;
    },
  },
  {
    id: "return-to-ai-carries-the-note",
    area: "handover",
    title: "Handing a chat back gives the AI the receptionist's note",
    because:
      "A handover note nobody reads is how a guest gets asked on WhatsApp for something they already answered on the phone.",
    async run({ prisma, tenantId }) {
      const { returnToAiFields, takeOverFields, HANDOVER_REASON } = await import("@/lib/crm/handover");
      const { conversationMode } = await import("@/lib/crm/handover");
      const { buildSystemPrompt } = await import("@/lib/ai/pipeline");
      const checks: FlowCheck[] = [];

      const number = `95552${String(seedCounter++).padStart(6, "0")}`;
      const contact = await prisma.contact.create({
        data: {
          tenantId,
          whatsappNumber: number,
          phone: number,
          name: "Handover Guest",
          ...takeOverFields(HANDOVER_REASON.MANUAL, "Priya"),
        },
      });

      const briefing = "Quoted 2400 for the Deluxe on the phone. Guest is checking with family.";
      const returned = await prisma.contact.update({
        where: { id: contact.id },
        data: returnToAiFields(briefing),
      });

      checks.push({ label: "the chat is back with the AI", passed: conversationMode(returned) === "ai" });
      checks.push({ label: "the note is stored on the contact", passed: returned.aiBriefing === briefing });
      checks.push({ label: "the handover fields are cleared", passed: returned.handoverAt === null && returned.handoverByName === null });

      // The half that actually matters: it has to reach the model, not just
      // the database.
      const { prompt } = await buildSystemPrompt(tenantId, [], {
        isFirstReply: false,
        daysSinceLastInbound: 1,
        leadSource: "DIRECT",
        sourceDetail: null,
        knownGuestCount: null,
        stayDates: null,
        staffBriefing: returned.aiBriefing,
      });
      checks.push({ label: "the note appears in the AI's prompt", passed: prompt.includes(briefing) });
      checks.push({
        label: "the AI is told not to read it out to the guest",
        passed: /do not read it out/i.test(prompt),
      });

      // And an empty briefing must not leave a stale note behind.
      const cleared = await prisma.contact.update({ where: { id: contact.id }, data: returnToAiFields() });
      checks.push({ label: "handing back with no note clears the old one", passed: cleared.aiBriefing === null });

      return checks;
    },
  },
  {
    id: "campaign-auto-review-flags-bad-copy",
    area: "campaigns",
    title: "The automated reviewer flags risky promotional copy",
    because:
      "The operator reads this recommendation instead of every broadcast cold. A checker that waves everything through gives false confidence.",
    async run() {
      const { deterministicConcerns } = await import("@/lib/campaigns/auto-review");
      const checks: FlowCheck[] = [];

      const bad = deterministicConcerns("HURRY!! LAST CHANCE TO BOOK OUR ROOMS!!!!");
      checks.push({ label: "flags a missing opt-out line", passed: bad.some((c) => c.issue.includes("opt-out")) });
      checks.push({ label: "flags manufactured urgency", passed: bad.some((c) => c.issue.includes("urgency")) });
      checks.push({ label: "flags all-caps copy", passed: bad.some((c) => c.issue.includes("capital")) });
      checks.push({
        label: "every concern carries an actionable suggestion",
        passed: bad.every((c) => c.suggestion.trim().length > 0),
      });

      const good = deterministicConcerns(
        "Hi Ravi, we have a quiet weekend rate this month if you're planning a trip. Reply STOP to opt out."
      );
      checks.push({ label: "leaves good copy alone", passed: good.length === 0 });

      return checks;
    },
  },
];
