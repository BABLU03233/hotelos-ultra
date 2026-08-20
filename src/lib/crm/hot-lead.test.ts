import { describe, expect, it } from "vitest";
import { HOT_THRESHOLD, hotLead, isHotLead } from "./hot-lead";

const NOW = new Date("2026-08-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

type Fields = Parameters<typeof hotLead>[0];
const contact = (over: Partial<Fields> = {}): Fields => ({
  leadStatus: "INTERESTED",
  bookingStatus: "NONE",
  pendingRoomId: null,
  pendingCheckIn: null,
  pendingCheckOut: null,
  pendingGuestCount: null,
  lastInboundAt: hoursAgo(5),
  optedOutAt: null,
  ...over,
});

describe("hotLead", () => {
  it("is hot when the guest picked a room and gave dates, then went quiet", () => {
    const c = contact({
      pendingRoomId: "room_1",
      pendingCheckIn: "2026-09-01",
      pendingCheckOut: "2026-09-03",
    });
    expect(isHotLead(c, NOW)).toBe(true);
    expect(hotLead(c, NOW).reasons).toContain("Picked a room and gave dates");
  });

  it("is not hot while the guest is still mid-conversation", () => {
    // The whole point is a follow-up list. Someone who messaged twenty minutes
    // ago needs Anushka to keep answering, not a phone call.
    const c = contact({
      pendingRoomId: "room_1",
      pendingCheckIn: "2026-09-01",
      pendingCheckOut: "2026-09-03",
      lastInboundAt: hoursAgo(0.25),
    });
    expect(isHotLead(c, NOW)).toBe(false);
  });

  it("goes cold once the intent is stale", () => {
    const c = contact({
      pendingRoomId: "room_1",
      pendingCheckIn: "2026-09-01",
      pendingCheckOut: "2026-09-03",
      lastInboundAt: hoursAgo(24 * 20),
    });
    expect(isHotLead(c, NOW)).toBe(false);
  });

  it("does not treat plain interest as close to booking", () => {
    // Without a room, dates or a started booking this is just an enquiry. If it
    // qualified, the hot list would be a second copy of the pipeline and would
    // stop being worth opening.
    expect(isHotLead(contact({ leadStatus: "INTERESTED" }), NOW)).toBe(false);
    expect(isHotLead(contact({ leadStatus: "FOLLOW_UP" }), NOW)).toBe(false);
  });

  it("counts a started-but-unconfirmed booking as hot", () => {
    expect(isHotLead(contact({ bookingStatus: "PENDING", leadStatus: "NEW" }), NOW)).toBe(true);
  });

  it("never lists a guest who already booked", () => {
    expect(isHotLead(contact({ leadStatus: "BOOKED", pendingRoomId: "room_1" }), NOW)).toBe(false);
    expect(isHotLead(contact({ bookingStatus: "CONFIRMED", pendingRoomId: "room_1" }), NOW)).toBe(false);
  });

  it("never lists a closed lead", () => {
    expect(isHotLead(contact({ leadStatus: "CLOSED", pendingCheckIn: "2026-09-01", pendingCheckOut: "2026-09-03" }), NOW)).toBe(false);
  });

  it("never lists someone who opted out", () => {
    // Chasing a guest who asked to be left alone is how a WhatsApp number
    // earns blocks, which costs every hotel on the platform.
    const c = contact({
      pendingRoomId: "room_1",
      pendingCheckIn: "2026-09-01",
      pendingCheckOut: "2026-09-03",
      optedOutAt: hoursAgo(48),
    });
    expect(isHotLead(c, NOW)).toBe(false);
  });

  it("never lists a contact who has never messaged", () => {
    expect(isHotLead(contact({ lastInboundAt: null, pendingRoomId: "room_1" }), NOW)).toBe(false);
  });

  it("ranks a fuller signal above a thinner one", () => {
    const both = hotLead(
      contact({ pendingRoomId: "r", pendingCheckIn: "2026-09-01", pendingCheckOut: "2026-09-03" }),
      NOW
    ).score;
    const datesOnly = hotLead(contact({ pendingCheckIn: "2026-09-01", pendingCheckOut: "2026-09-03" }), NOW).score;
    expect(both).toBeGreaterThan(datesOnly);
    expect(datesOnly).toBeGreaterThanOrEqual(HOT_THRESHOLD);
  });

  it("gives a reason for every lead it calls hot", () => {
    // A flame with no explanation is a badge staff learn to ignore.
    const c = contact({ pendingCheckIn: "2026-09-01", pendingCheckOut: "2026-09-03" });
    expect(hotLead(c, NOW).reasons.length).toBeGreaterThan(0);
  });

  it("returns no reasons for a lead below the bar", () => {
    // Reasons are only meaningful alongside a hot verdict; leaking them for a
    // cold lead would put an unexplained chip on an ordinary row.
    expect(hotLead(contact({ leadStatus: "INTERESTED" }), NOW).reasons).toEqual([]);
  });
});
