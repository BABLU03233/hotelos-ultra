/**
 * Matching a contact against what someone typed into a search box.
 *
 * Kept separate from the component because the phone half is all edge cases:
 * contacts are stored E.164 ("+918688433376") and nobody searches that way.
 * They type the ten digits off a phone screen, or paste something carrying
 * spaces, dashes or brackets. Comparing the stored string directly misses
 * every one of those.
 */

export interface SearchableContact {
  name?: string | null;
  phone: string;
}

/** Strips everything that is not a digit, so formatting never decides a match. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function matchesSearch(contact: SearchableContact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if ((contact.name || "").toLowerCase().includes(q)) return true;

  // A query of only punctuation or spaces reduces to no digits. Without this
  // guard "" would be a substring of every phone number and a search for "-"
  // would match the entire contact list — the opposite of what searching is
  // for, and dangerous on a screen whose next button sends a broadcast.
  const qDigits = digitsOnly(q);
  if (qDigits.length === 0) return false;

  return digitsOnly(contact.phone).includes(qDigits);
}
