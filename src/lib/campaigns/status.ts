import { Campaign } from "@/types";

/**
 * The one place that turns a campaign's raw fields into the status a hotel
 * owner reads.
 *
 * Shared by the campaigns list and the campaign detail screen because the two
 * disagreeing is worse than either being slightly wrong — an owner who sees
 * "Scheduled" in the list and "Waiting for approval" on the detail page has no
 * idea whether their offer is going out tonight.
 *
 * Note the ordering: sent wins over everything (it already happened), and
 * approval state is read before scheduling, because a scheduled campaign that
 * has not been approved is not going out at that time and must not claim it
 * is.
 */
export type CampaignStatusTone = "sent" | "waiting" | "rejected" | "ready" | "scheduled" | "draft";

export interface CampaignStatus {
  label: string;
  tone: CampaignStatusTone;
  /** Longer line for the detail screen — null where the label says it all. */
  detail: string | null;
}

const TONE_CLASS: Record<CampaignStatusTone, string> = {
  sent: "text-emerald-600",
  ready: "text-emerald-600",
  waiting: "text-amber-600",
  scheduled: "text-amber-600",
  rejected: "text-red-600",
  draft: "text-muted-foreground",
};

export function campaignStatusClass(tone: CampaignStatusTone): string {
  return TONE_CLASS[tone];
}

export function campaignStatus(
  c: Pick<Campaign, "sentAt" | "scheduledAt" | "approval" | "reviewNote">,
  /**
   * Delivery counts, where the caller has them.
   *
   * Optional so the list can still call this with just the campaign, but
   * passing them is what stops the worst version of this screen: a live
   * broadcast displayed a confident green "Sent" while BOTH recipients had
   * failed. It had reached nobody. "Sent" has to mean sent.
   */
  delivery?: { sent: number; failed: number }
): CampaignStatus {
  if (c.sentAt) {
    if (delivery && delivery.sent === 0 && delivery.failed > 0) {
      return {
        label: "Didn't reach anyone",
        tone: "rejected",
        detail: `All ${delivery.failed} ${delivery.failed === 1 ? "message" : "messages"} failed. Open the campaign to see why.`,
      };
    }
    if (delivery && delivery.failed > 0) {
      return {
        label: `Sent to ${delivery.sent} of ${delivery.sent + delivery.failed}`,
        tone: "sent",
        detail: `${delivery.failed} could not be delivered. Open the campaign to see why.`,
      };
    }
    return { label: "Sent", tone: "sent", detail: null };
  }

  if (c.approval === "CHANGES_REQUESTED") {
    return {
      label: "Needs a change",
      tone: "rejected",
      detail: c.reviewNote ?? "We asked for a change before this goes out. Edit it and submit it again.",
    };
  }

  if (c.approval === "REJECTED") {
    return {
      label: "Changes needed",
      tone: "rejected",
      detail: c.reviewNote ?? "This campaign wasn't approved. Edit it and submit it again.",
    };
  }

  if (c.approval === "PENDING_REVIEW") {
    return {
      label: "Waiting for approval",
      tone: "waiting",
      detail: "We check every broadcast before it goes out — usually within a few hours.",
    };
  }

  if (c.approval === "DRAFT") return { label: "Draft", tone: "draft", detail: null };

  // Approved from here down.
  if (c.scheduledAt) {
    return { label: "Scheduled", tone: "scheduled", detail: "Approved — it will go out at the scheduled time." };
  }
  return { label: "Ready to send", tone: "ready", detail: "Approved — send it whenever you're ready." };
}
