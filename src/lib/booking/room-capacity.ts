/**
 * Ordering rooms for a party — never hiding one.
 *
 * This used to FILTER: a room whose stated capacity was below the party size
 * was dropped from the list entirely. That was written to stop a party of
 * three reaching a booking reference for a room that sleeps two.
 *
 * The hotel says that is not how it works. Extra mattresses exist, "sleeps 2"
 * is what the room comfortably fits rather than a hard limit, and a guest for
 * three can absolutely take a Classic Room. Filtering on it produced the
 * opposite and worse failure: a party of three was shown two rooms instead of
 * three and told "we have 2 rooms free", which reads as a hotel nearly full.
 * Losing the booking outright costs more than a conversation about a mattress.
 *
 * So capacity is now a hint, not a gate. Rooms that comfortably fit the party
 * come first, everything else follows, and nothing is ever removed — the guest
 * sees the whole list and picks.
 */

export interface RoomLike {
  capacity: number;
}

/**
 * Every room, ordered so the ones that comfortably fit the party come first.
 *
 * Within each group the caller's existing order is preserved (rooms arrive
 * sorted by price), so the cheapest suitable room is still the first thing a
 * guest sees.
 */
export function roomsFittingParty<T extends RoomLike>(rooms: T[], guests: number | null | undefined): T[] {
  if (!guests || guests < 1) return rooms;
  const fits = rooms.filter((r) => r.capacity >= guests);
  const rest = rooms.filter((r) => r.capacity < guests);
  return [...fits, ...rest];
}
