import {
  CHECK_IN_OTHER_ID,
  CHECK_IN_PREFIX,
  NIGHTS_MORE_ID,
  NIGHTS_PREFIX,
  parseCheckInId,
  parseNightsId,
  TYPE_DATES_ID,
} from "./date-picker-message";

/**
 * What a tap on any date-picker row should do — as a pure decision, separate
 * from the sending and the database writes.
 *
 * This exists because of a real production bug. The routing originally lived
 * inline in handle-inbound-message.ts, tangled with Prisma calls and WhatsApp
 * sends, which made it effectively untestable — and it shipped with an
 * infinite loop: "Longer stay" and "Another date" both reused the id that
 * OPENS a picker, so tapping "none of these suit me" re-sent the identical
 * list, forever, with no way out. A 500,000-conversation soak missed it
 * entirely because that soak drives typed text and never a button tap.
 *
 * Pulled out here, the whole space of taps is enumerable, so the invariant
 * that actually matters can be asserted exhaustively: NO row may route back
 * to the list it appears in.
 */

export type PickerAction =
  /** Open the check-in list. */
  | { kind: "openCheckInPicker" }
  /** Guest chose an arrival day. */
  | { kind: "setCheckIn"; checkIn: Date }
  /** Guest chose a stay length. */
  | { kind: "setCheckOut"; checkOut: Date }
  /** Answer in prose and wait for typed input — carries no list, so it cannot loop. */
  | { kind: "prompt"; text: string }
  /** Not a date-picker tap; someone else handles it. */
  | { kind: "notMine" };

export const TYPE_A_DATE_PROMPT = "No problem — which day would you like to check in? Just type the date (e.g. 25 Aug) 😊";
export const HOW_MANY_NIGHTS_PROMPT = "Sure — how many nights would you like to stay? Just type the number 😊";

export function routeDatePickerTap(
  interactiveId: string | null | undefined,
  state: { pendingCheckIn: Date | null },
  now: Date = new Date()
): PickerAction {
  if (!interactiveId) return { kind: "notMine" };

  // The way IN, from DATE_QUICK_PICK's "Pick exact dates".
  if (interactiveId === TYPE_DATES_ID) return { kind: "openCheckInPicker" };

  // Escape hatches. Both answer in prose deliberately: a "none of these"
  // row that re-opens a list is the exact shape of the loop this file was
  // written to prevent.
  if (interactiveId === CHECK_IN_OTHER_ID) return { kind: "prompt", text: TYPE_A_DATE_PROMPT };
  if (interactiveId === NIGHTS_MORE_ID) return { kind: "prompt", text: HOW_MANY_NIGHTS_PROMPT };

  if (interactiveId.startsWith(CHECK_IN_PREFIX)) {
    const checkIn = parseCheckInId(interactiveId, now);
    // A stale row from a picker sent days ago now names a past date —
    // reopen on today's dates rather than book the wrong day.
    return checkIn ? { kind: "setCheckIn", checkIn } : { kind: "openCheckInPicker" };
  }

  if (interactiveId.startsWith(NIGHTS_PREFIX)) {
    // Nights tapped with no arrival day settled (a stale list, or taps out
    // of order) — go back for the arrival day first.
    if (!state.pendingCheckIn) return { kind: "openCheckInPicker" };
    const checkOut = parseNightsId(interactiveId, state.pendingCheckIn);
    return checkOut ? { kind: "setCheckOut", checkOut } : { kind: "openCheckInPicker" };
  }

  return { kind: "notMine" };
}
