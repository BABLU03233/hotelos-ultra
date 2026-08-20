/**
 * Which rooms can actually hold this party.
 *
 * Probed live against the real flow: a guest tapping "3+ people" was offered
 * the Classic Room, which sleeps 2. Nothing downstream re-checks, so the funnel
 * would have carried them to a booking reference for a room that cannot hold
 * them — and reception discovers it at check-in, in front of the guest.
 *
 * The rule lives here rather than inline because it was needed in two places
 * that had each grown their own copy of "which rooms can we offer" — the
 * button handler in handle-inbound-message.ts and the funnel in
 * process-message-job.ts. Only the second is on the main path, which is
 * exactly why fixing the first alone appeared to do nothing.
 */

export interface RoomLike {
  capacity: number;
}

/**
 * Falls back to the full list when nothing fits, deliberately.
 *
 * A party larger than any single room is a real situation (a family of nine
 * wanting three rooms) and it needs a person, not an empty screen. Both
 * callers already treat an empty list as "no availability on these dates" —
 * a different and untrue thing to tell someone whose real problem is that
 * they are a big group. Returning everything keeps the conversation alive
 * and lets the guest or a staff member sort it out.
 */
export function roomsFittingParty<T extends RoomLike>(rooms: T[], guests: number | null | undefined): T[] {
  if (!guests || guests < 1) return rooms;
  const fitting = rooms.filter((r) => r.capacity >= guests);
  return fitting.length ? fitting : rooms;
}
