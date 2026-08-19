import { describe, expect, it } from "vitest";
import {
  ExportableContact,
  META_CSV_HEADERS,
  buildMetaCsv,
  countExportable,
  isExportable,
  matchesSegment,
  splitName,
  toE164,
} from "./export";

const c = (over: Partial<ExportableContact> = {}): ExportableContact => ({
  name: "Rakesh Kumar",
  phone: "916305389600",
  whatsappNumber: "916305389600",
  leadStatus: "INTERESTED",
  bookingStatus: "NONE",
  createdAt: new Date("2026-08-01"),
  lastInboundAt: new Date("2026-08-17"),
  optedOutAt: null,
  ...over,
});

describe("phone numbers reach Meta in a matchable form", () => {
  it("adds the + WhatsApp omits", () => {
    expect(toE164("916305389600")).toBe("+916305389600");
  });

  it("qualifies a bare 10-digit Indian number rather than sending it ambiguous", () => {
    // An unqualified number matches nothing in Meta's index.
    expect(toE164("6305389600")).toBe("+916305389600");
  });

  it("strips punctuation people type into phone fields", () => {
    expect(toE164("+91 63053-89600")).toBe("+916305389600");
  });

  it("returns empty for junk rather than a bogus +", () => {
    expect(toE164("")).toBe("");
    expect(toE164("n/a")).toBe("");
  });
});

describe("names are split the way Meta expects", () => {
  it("splits first and last", () => {
    expect(splitName("Rakesh Kumar")).toEqual({ fn: "Rakesh", ln: "Kumar" });
  });

  it("leaves the surname empty for a single-word profile name", () => {
    // Very common on Indian WhatsApp. Duplicating the given name into the
    // surname column would only add mismatches.
    expect(splitName("Priya")).toEqual({ fn: "Priya", ln: "" });
  });

  it("keeps a multi-part surname together", () => {
    expect(splitName("Ravi Teja Rao")).toEqual({ fn: "Ravi", ln: "Teja Rao" });
  });

  it("handles a missing name", () => {
    expect(splitName(null)).toEqual({ fn: "", ln: "" });
  });
});

describe("opted-out guests are never exported", () => {
  // They asked the hotel to stop contacting them. Putting them in an ad
  // audience is the same intrusion through another channel, and this is not
  // a filter the caller may turn off.
  it("excludes them from every segment", () => {
    const optedOut = c({ optedOutAt: new Date("2026-08-10"), bookingStatus: "CONFIRMED" });
    expect(isExportable(optedOut)).toBe(false);
    for (const seg of ["all", "booked", "interested", "not-booked"] as const) {
      expect(buildMetaCsv([optedOut], seg).trim()).toBe(META_CSV_HEADERS.join(","));
    }
  });

  it("excludes a contact with no usable number", () => {
    expect(isExportable(c({ phone: "", whatsappNumber: "" }))).toBe(false);
  });
});

describe("segments target the right people", () => {
  const booked = c({ bookingStatus: "CONFIRMED", leadStatus: "BOOKED" });
  const interested = c({ leadStatus: "INTERESTED" });
  const cold = c({ leadStatus: "NEW" });

  it("booked = actual paying customers, the seed worth a lookalike", () => {
    expect(matchesSegment(booked, "booked")).toBe(true);
    expect(matchesSegment(interested, "booked")).toBe(false);
  });

  it("not-booked = the retargeting list", () => {
    expect(matchesSegment(interested, "not-booked")).toBe(true);
    expect(matchesSegment(cold, "not-booked")).toBe(true);
    expect(matchesSegment(booked, "not-booked")).toBe(false);
  });

  it("all includes everyone still contactable", () => {
    expect(countExportable([booked, interested, cold], "all")).toBe(3);
  });
});

describe("the CSV is exactly Meta's schema", () => {
  it("uses Meta's own column names, which Ads Manager matches on", () => {
    // Renaming any header to something friendlier makes Ads Manager silently
    // drop the column, producing a low match rate with no visible error.
    expect(buildMetaCsv([], "all").trim()).toBe("phone,fn,ln,country");
  });

  it("writes one row per contact in the right order", () => {
    const csv = buildMetaCsv([c()], "all");
    expect(csv).toBe("phone,fn,ln,country\n+916305389600,Rakesh,Kumar,IN\n");
  });

  it("quotes a name containing a comma", () => {
    const csv = buildMetaCsv([c({ name: "Rao, Ravi" })], "all");
    expect(csv).toContain('"Rao,",Ravi,IN');
  });

  it("ends with a newline, which some uploaders need to read the last row", () => {
    expect(buildMetaCsv([c()], "all").endsWith("\n")).toBe(true);
  });
});
