import { beforeEach, describe, expect, it, vi } from "vitest";

// The prompt builder reads the hotel's own records, so the database is stubbed
// rather than run — these tests are about what reaches the model, not about
// Prisma.
const hotel = {
  name: "Hotel Ivory Towers",
  aiAgentName: "Anushka",
  address: "Uppal, Hyderabad",
  checkInTime: "12:00 PM",
  checkOutTime: "11:00 AM",
  wifiInfo: "Complimentary high-speed Wi-Fi in every room.",
  parkingInfo: "Free covered on-site parking.",
  aiSystemPrompt: null,
  googleMapsUrl: null,
};

const rooms = [
  { id: "r1", name: "Classic Room", type: "Classic", price: 999, capacity: 2, description: "Queen comfort.", imageUrls: [] },
  { id: "r2", name: "Deluxe Room", type: "Deluxe", price: 1299, capacity: 3, description: "City views.", imageUrls: [] },
  { id: "r3", name: "Premium Room", type: "Premium", price: 1599, capacity: 3, description: "Larger.", imageUrls: [] },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hotelProfile: { findUnique: vi.fn(async () => hotel) },
    room: { findMany: vi.fn(async () => rooms) },
    faq: { findMany: vi.fn(async () => []) },
    offer: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/booking/availability", () => ({
  findUnavailableRoomIds: vi.fn(async () => new Set<string>()),
}));

const { buildSystemPrompt } = await import("./pipeline");

const baseContext = {
  isFirstReply: true,
  daysSinceLastInbound: null,
  leadSource: "DIRECT" as const,
  sourceDetail: null,
  knownGuestCount: null,
  stayDates: null,
  language: "en" as const,
};

const build = (ctx: Partial<typeof baseContext> & Record<string, unknown> = {}) =>
  buildSystemPrompt("t1", [], { ...baseContext, ...ctx } as never, {
    history: [],
    guestMessage: "hi",
  });

describe("the guest's name actually reaches the model", () => {
  beforeEach(() => vi.clearAllMocks());

  // The bug: the RULES have always said "use the guest's name if you know it",
  // WhatsApp sends it on every message and we store it — and nothing ever put
  // it in the prompt. The model was told to use something it was never given.
  it("includes the name when we have one", async () => {
    const { prompt } = await build({ guestName: "Rakesh" });
    expect(prompt).toContain("Rakesh");
    expect(prompt).toMatch(/ABOUT THIS GUEST/);
  });

  it("says nothing about the guest when there is nothing true to say", async () => {
    const { prompt } = await build({});
    expect(prompt).not.toMatch(/ABOUT THIS GUEST/);
  });
});

describe("a returning guest is recognised", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tells the model about previous stays and the room they chose", async () => {
    const { prompt } = await build({
      returning: { stays: 2, lastRoomName: "Deluxe Room", lastCheckOut: new Date("2026-05-14T00:00:00Z") },
    });
    expect(prompt).toMatch(/stayed here before/);
    expect(prompt).toMatch(/2 previous bookings/);
    expect(prompt).toMatch(/Deluxe Room/);
    expect(prompt).toMatch(/May 2026/);
  });

  it("uses the singular for a single previous stay", async () => {
    const { prompt } = await build({ returning: { stays: 1, lastRoomName: null, lastCheckOut: null } });
    expect(prompt).toMatch(/1 previous booking\b/);
  });

  it("says nothing about returning when they have never stayed", async () => {
    const { prompt } = await build({ returning: null });
    expect(prompt).not.toMatch(/stayed here before/);
  });
});

describe("scarcity is only mentioned when it is real", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays silent when every room is free", async () => {
    const { prompt } = await build({
      stayDates: { checkIn: new Date("2026-09-01"), checkOut: new Date("2026-09-03") },
    });
    // All three rooms available — nothing scarce, so no urgency at all. The
    // RULES forbid invented urgency and this must never manufacture any.
    expect(prompt).not.toMatch(/still free for their dates/);
  });

  it("mentions it once when genuinely low", async () => {
    const { findUnavailableRoomIds } = await import("@/lib/booking/availability");
    vi.mocked(findUnavailableRoomIds).mockResolvedValueOnce(new Set(["r2", "r3"]));

    const { prompt } = await build({
      stayDates: { checkIn: new Date("2026-09-01"), checkOut: new Date("2026-09-03") },
    });
    expect(prompt).toMatch(/Only 1 of the hotel's 3 rooms is still free/);
    expect(prompt).toMatch(/never dress it up as a countdown/);
  });
});
