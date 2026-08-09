/**
 * Deterministic room capture for real-time availability checking: rather
 * than asking the AI to emit yet another marker, this piggybacks on
 * behavior CONVERSATION FLOW's RECOMMEND stage already mandates ("recommend
 * ONE specific room by name with its starting price") -- no new marker
 * syntax for the AI to remember, so no new reliability risk. Called
 * whenever mentionsRoomPrice(replyText) is true, the same trigger point
 * ROOM_RESPONSE buttons already use.
 *
 * Deliberately fail-soft: 0 matches (room name phrased differently than
 * expected) or >1 matches (the reply names two rooms, e.g. a HANDLE
 * OBJECTIONS "here's a cheaper option" reply) both return null rather than
 * guessing -- a miss just means the Confirm-booking-tap gate asks once
 * more, never a silently wrong room.
 */
export function matchRecommendedRoom(replyText: string, rooms: { id: string; name: string }[]): string | null {
  const lower = replyText.toLowerCase();
  const matches = rooms.filter((r) => lower.includes(r.name.toLowerCase()));
  return matches.length === 1 ? matches[0].id : null;
}
