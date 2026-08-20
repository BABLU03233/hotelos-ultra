/**
 * Guests who got close to booking and then stopped.
 *
 * Deliberately DERIVED, never a flag someone ticks. A manual "hot" toggle is
 * more work for the receptionist — the person whose work this is supposed to
 * reduce — and it rots the moment nobody updates it: a lead marked hot three
 * weeks ago still shows hot, so the list stops meaning anything and gets
 * ignored. Everything below is read from what the guest actually did.
 *
 * "Close to booking" is not the same as "interested". The strong signal is
 * that Anushka and the guest converged on something specific — a room, dates,
 * a party size — because that only happens after the questions are answered.
 * A guest who asked about parking is curious; a guest who picked the Deluxe
 * for the 14th to the 16th and went quiet is a sale that is one phone call
 * from closing.
 *
 * "And then stopped" matters just as much. Someone mid-conversation right now
 * does not need chasing; they need Anushka to keep answering. So a lead only
 * becomes hot once it has gone quiet for a bit.
 */

export interface HotLeadFields {
  leadStatus: string;
  bookingStatus: string;
  pendingRoomId: string | null;
  pendingCheckIn: Date | string | null;
  pendingCheckOut: Date | string | null;
  pendingGuestCount: number | null;
  lastInboundAt: Date | string | null;
  optedOutAt: Date | string | null;
}

export interface HotLead {
  score: number;
  /** Short, human phrases explaining the score — shown to the receptionist. */
  reasons: string[];
}

/**
 * Long enough that a guest still typing is not on the chase list, short enough
 * that a warm lead is followed up the same day. A guest who asked a question
 * twenty minutes ago is mid-conversation.
 */
const QUIET_AFTER_MS = 90 * 60 * 1000;

/**
 * Past this, intent is stale — they booked elsewhere or the trip passed.
 * Keeping month-old leads on the list is how it becomes a list nobody opens.
 */
const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

const toTime = (v: Date | string | null): number | null =>
  v ? (v instanceof Date ? v.getTime() : new Date(v).getTime()) : null;

export function hotLead(contact: HotLeadFields, now: Date = new Date()): HotLead {
  const reasons: string[] = [];

  // Already won, already lost, or asked not to be contacted. None of these are
  // a follow-up opportunity, and putting an opted-out guest on a chase list is
  // how a WhatsApp number earns a block.
  if (contact.leadStatus === "BOOKED" || contact.leadStatus === "CLOSED") return { score: 0, reasons };
  if (contact.bookingStatus === "CONFIRMED") return { score: 0, reasons };
  if (contact.optedOutAt) return { score: 0, reasons };

  const last = toTime(contact.lastInboundAt);
  if (last === null) return { score: 0, reasons };

  const age = now.getTime() - last;
  // Still talking. Not a follow-up — leave them to Anushka.
  if (age < QUIET_AFTER_MS) return { score: 0, reasons };
  if (age > STALE_AFTER_MS) return { score: 0, reasons };

  let score = 0;

  const hasDates = Boolean(contact.pendingCheckIn && contact.pendingCheckOut);
  const hasRoom = Boolean(contact.pendingRoomId);

  // The strongest thing a guest can do short of confirming: name a room AND
  // the nights they want it.
  if (hasRoom && hasDates) {
    score += 5;
    reasons.push("Picked a room and gave dates");
  } else if (hasDates) {
    score += 3;
    reasons.push("Gave dates");
  } else if (hasRoom) {
    score += 3;
    reasons.push("Picked a room");
  }

  if (contact.pendingGuestCount) {
    score += 1;
    reasons.push(`${contact.pendingGuestCount} guest${contact.pendingGuestCount === 1 ? "" : "s"}`);
  }

  // A booking that was started and never completed.
  if (contact.bookingStatus === "PENDING") {
    score += 4;
    reasons.push("Started booking, not confirmed");
  }

  if (contact.leadStatus === "INTERESTED") {
    score += 2;
    reasons.push("Marked interested");
  } else if (contact.leadStatus === "FOLLOW_UP") {
    score += 1;
    reasons.push("Marked for follow-up");
  }

  // Interest alone is not "close to booking". Without a concrete signal —
  // room, dates, or a started booking — a merely INTERESTED lead scores 2 and
  // stays off the list, which is the intent: this is a short list of people
  // worth phoning, not a second copy of the pipeline.
  if (score < HOT_THRESHOLD) return { score, reasons: [] };

  // Freshness last, as a tie-break rather than a qualifier — it decides the
  // order of two equally-close leads, and should never make a vague one hot.
  if (age < 24 * 60 * 60 * 1000) {
    score += 1;
    reasons.push("Went quiet today");
  }

  return { score, reasons };
}

/**
 * The bar for appearing on the list. Set so that concrete progress toward a
 * specific stay qualifies and a general expression of interest does not:
 * "gave dates" (3) is in, "marked interested" (2) alone is out.
 */
export const HOT_THRESHOLD = 3;

export function isHotLead(contact: HotLeadFields, now: Date = new Date()): boolean {
  return hotLead(contact, now).score >= HOT_THRESHOLD;
}
