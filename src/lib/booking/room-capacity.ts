/**
 * Which rooms can physically hold this party.
 *
 * This went through two wrong shapes before landing here, and both were
 * corrections to a real, live-reported problem — worth keeping straight,
 * because the fix looks similar to a mistake already made and reverted once.
 *
 *   1. Originally a hard filter, dropping any room below the party size.
 *      A party of 3 then saw only 2 of the hotel's 3 room types, and the
 *      room-list body used to say "we have 2 rooms free" — which read as a
 *      hotel nearly full. That wording bug is now fixed independently (the
 *      body no longer states a count at all), but at the time the two bugs
 *      were entangled.
 *
 *   2. So capacity was changed to a HINT: never hide a room, just order the
 *      better fits first. That was wrong for the opposite reason — the
 *      hotel does not have extra mattresses. A 2-person room genuinely
 *      cannot hold 3 people, "3 people cannot adjust" in the owner's own
 *      words, and offering it anyway sends a guest to book a room that will
 *      turn them away at check-in. That is a worse failure than the guest
 *      never seeing it: a promise the hotel cannot keep, made by name.
 *
 * So capacity is a hard filter again — a room that cannot hold the party is
 * never offered as bookable — but the wording bug from attempt 1 cannot
 * recur, because the room-list body has not stated a count since the fix
 * described above. What remains is exactly what should remain: a shorter,
 * honest list.
 */

export interface RoomLike {
  capacity: number;
}

/**
 * Only the rooms that can actually hold this party, cheapest first (the
 * caller's existing order is preserved).
 *
 * Returns everything when the party size is unknown — there is nothing yet
 * to filter on. Returns an EMPTY list when nothing fits; the caller decides
 * what to say (see the oversized-party handover in process-message-job.ts,
 * which normally intercepts this case earlier and hands the guest to
 * reception before a room list is ever attempted).
 */
export function roomsFittingParty<T extends RoomLike>(rooms: T[], guests: number | null | undefined): T[] {
  if (!guests || guests < 1) return rooms;
  return rooms.filter((r) => r.capacity >= guests);
}
