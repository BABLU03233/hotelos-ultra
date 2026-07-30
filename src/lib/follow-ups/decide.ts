import { isWithin24HourWindow } from "@/lib/whatsapp/window";

export type FollowUpDecision = { type: "cancel" } | { type: "skip" } | { type: "send"; withinWindow: boolean };

export interface FollowUpDecisionInput {
  ruleActive: boolean;
  ruleTemplateName: string | null;
  leadStatus: "NEW" | "INTERESTED" | "FOLLOW_UP" | "BOOKED" | "CLOSED";
  lastInboundAt: Date | null;
}

/**
 * Pure decision logic for one due ScheduledFollowUp row — split out from
 * sweep.ts so the "should we send / skip / cancel" rules are unit-testable
 * without a database. See sweep.ts for how this plugs into the actual send.
 */
export function decideFollowUpAction(input: FollowUpDecisionInput, now: Date = new Date()): FollowUpDecision {
  if (!input.ruleActive || input.leadStatus === "BOOKED" || input.leadStatus === "CLOSED") {
    return { type: "cancel" };
  }

  const withinWindow = isWithin24HourWindow(input.lastInboundAt, now);
  if (!withinWindow && !input.ruleTemplateName) {
    return { type: "skip" };
  }

  return { type: "send", withinWindow };
}
