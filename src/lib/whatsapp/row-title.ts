/**
 * WhatsApp caps a list row's title at 24 characters, and every list builder in
 * this app used to enforce that with a bare `.slice(0, 24)`.
 *
 * That cuts mid-word. Probed live, the FAQ list rendered:
 *
 *     [What time is check-in an | Is parking available?]
 *
 * "check-in an" is not a shortened question, it is a broken one — it reads as
 * a rendering fault rather than a deliberate abbreviation, and it is the
 * hotel's own voice it makes look careless.
 *
 * Cutting at a word boundary with an ellipsis reads as intentional:
 *
 *     [What time is check-in… | Is parking available?]
 *
 * The full text is never lost either way — the description carries the answer,
 * and tapping the row gives the whole thing.
 */

export const ROW_TITLE_MAX = 24;

export function truncateRowTitle(text: string, max: number = ROW_TITLE_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  // Reserve one character for the ellipsis so the result still fits the cap.
  const room = max - 1;
  const cut = trimmed.slice(0, room);
  const lastSpace = cut.lastIndexOf(" ");

  // Only honour a word boundary that leaves something readable. A title whose
  // first word alone overflows (a long room name, a Telugu compound) is better
  // hard-cut than reduced to two letters and a dot.
  const body = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;

  // Trailing punctuation before an ellipsis reads as a typo ("check-in,…").
  return `${body.replace(/[\s,;:.\-–—]+$/, "")}…`;
}
