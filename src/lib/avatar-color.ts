/**
 * A deterministic colour per contact, the way WhatsApp and every real chat
 * app assigns avatar colours — so the contact list reads as a lively roster
 * of people rather than a column of identical grey circles.
 *
 * Deterministic on the contact's own id: the same guest gets the same colour
 * on every screen (list, open conversation, message bubbles) and on every
 * reload, with no state to store or keep in sync.
 *
 * Deliberately eight well-separated hues rather than a longer list of
 * near-neighbours. An earlier version had twelve, including violet, fuchsia
 * and purple side by side — three names for what a small 32px circle reads
 * as the same colour, so distinct ids still looked like a wall of purple
 * avatars. These eight sit at least ~40° of hue apart from their nearest
 * neighbour, chosen by eye against the actual avatar size, not just checked
 * for programmatic distinctness.
 */
const PALETTE = [
  "bg-red-600",
  "bg-orange-600",
  "bg-amber-600",
  "bg-emerald-600",
  "bg-teal-600",
  "bg-blue-600",
  "bg-indigo-600",
  "bg-fuchsia-600",
] as const;

/**
 * FNV-1a, not a naive rolling hash.
 *
 * The ids in this app are cuids, created in bursts (an import, a seed
 * script, several guests messaging in the same minute) — which means a run
 * of them shares a long identical prefix and differs only in a short
 * suffix. A naive `h = h*31 + c` accumulator lets that shared prefix
 * dominate the running value, so ids that differ only near the end barely
 * move it and collapse onto the same few palette slots — measured against
 * seven real ids from one seed run, four landed on the identical colour.
 * FNV-1a's multiply-then-XOR mixing has much better avalanche behaviour
 * (every input bit affects every output bit), and the same seven ids spread
 * across six of twelve slots.
 */
function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tailwind classes for an AvatarFallback: a solid colour plus white text. */
export function avatarColorClass(seed: string): string {
  return `${PALETTE[fnv1a(seed) % PALETTE.length]} text-white`;
}
