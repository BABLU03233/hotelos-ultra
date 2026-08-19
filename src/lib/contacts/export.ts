import { BookingStatus, LeadStatus } from "@/generated/prisma/enums";

/**
 * Exporting contacts as a Meta-ready customer list.
 *
 * Meta's Custom Audience uploader reads a flat file with ITS OWN column names
 * ("phone", "fn", "ln", "country") — not friendly headings. Ads Manager
 * matches on those headers and silently drops any column it doesn't
 * recognise, so a prettier spreadsheet is a worse audience: the upload
 * "succeeds" with a low match rate and nobody can see why.
 *
 * Two shapes are produced for that reason:
 *
 *   csv   — exactly Meta's schema, nothing else. This is what gets uploaded.
 *   xlsx  — the same people with readable columns and booking context, for
 *           the hotel's own use.
 */

export type ExportSegment = "all" | "booked" | "interested" | "not-booked";

export interface ExportableContact {
  name: string | null;
  phone: string;
  whatsappNumber: string;
  leadStatus: LeadStatus;
  bookingStatus: BookingStatus;
  createdAt: Date;
  lastInboundAt: Date | null;
  optedOutAt: Date | null;
}

/** Meta's own column names. Renaming any of these silently breaks matching. */
export const META_CSV_HEADERS = ["phone", "fn", "ln", "country"] as const;

/**
 * E.164, which is the format Meta matches best against.
 *
 * WhatsApp gives the number without a plus ("916305389600"); Meta's docs ask
 * for the country code and accept a leading "+". A bare 10-digit Indian
 * number is prefixed with 91 rather than sent ambiguous — an unqualified
 * number matches nothing.
 */
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Meta wants first and last name in separate columns. Indian WhatsApp profile
 * names are frequently a single word, so the surname column is left empty
 * rather than duplicating the given name, which would only add mismatches.
 */
export function splitName(name: string | null): { fn: string; ln: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { fn: "", ln: "" };
  if (parts.length === 1) return { fn: parts[0], ln: "" };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
}

/**
 * Which people this export is for.
 *
 * The segment matters more than the file format. A lookalike seeded from
 * everyone who ever messaged is a lookalike of "people who message hotels";
 * one seeded from guests who actually BOOKED is a lookalike of paying
 * customers, which is the audience worth spending on. "not-booked" is the
 * retargeting list — real interest, no booking yet.
 */
export function matchesSegment(c: ExportableContact, segment: ExportSegment): boolean {
  switch (segment) {
    case "booked":
      return c.bookingStatus === "CONFIRMED" || c.leadStatus === "BOOKED";
    case "interested":
      return c.leadStatus === "INTERESTED" || c.leadStatus === "FOLLOW_UP";
    case "not-booked":
      return c.bookingStatus !== "CONFIRMED" && c.leadStatus !== "BOOKED";
    default:
      return true;
  }
}

/**
 * Anyone who asked to stop hearing from the hotel is excluded from every
 * segment, always.
 *
 * They opted out of marketing; putting them in an ad audience is the same
 * intrusion through a different channel, and in Meta's terms it is the
 * hotel's own responsibility to have consent for every row uploaded. This is
 * not a filter the caller gets to turn off.
 */
export function isExportable(c: ExportableContact): boolean {
  return !c.optedOutAt && Boolean(toE164(c.whatsappNumber || c.phone));
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The file that goes straight into Ads Manager's customer-list uploader. */
export function buildMetaCsv(contacts: ExportableContact[], segment: ExportSegment): string {
  const rows = contacts.filter(isExportable).filter((c) => matchesSegment(c, segment));
  const lines = [META_CSV_HEADERS.join(",")];
  for (const c of rows) {
    const { fn, ln } = splitName(c.name);
    lines.push([toE164(c.whatsappNumber || c.phone), fn, ln, "IN"].map(csvCell).join(","));
  }
  // Trailing newline: some uploaders drop the final row without one.
  return `${lines.join("\n")}\n`;
}

/** How many rows a given segment would actually export — for the UI's counts. */
export function countExportable(contacts: ExportableContact[], segment: ExportSegment): number {
  return contacts.filter(isExportable).filter((c) => matchesSegment(c, segment)).length;
}
