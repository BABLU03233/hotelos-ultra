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
  c: Pick<Campaign, "sentAt" | "scheduledAt" | "approval" | "reviewNote">
): CampaignStatus {
  if (c.sentAt) return { label: "Sent", tone: "sent", detail: null };

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
