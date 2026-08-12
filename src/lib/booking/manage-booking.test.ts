import { describe, expect, it, vi } from "vitest";
import { CANCEL_BOOKING_ID, CHANGE_DATES_ID, KEEP_BOOKING_ID, beginReschedule, cancelBooking, findActiveBooking } from "./manage-booking";
import { looksLikeExistingBookingRequest } from "@/lib/ai/interactive-prompts";
import { t } from "@/lib/i18n/guest-language";
import type { PrismaClient } from "@/generated/prisma/client";

const BOOKING = {
  id: "b1",
  referenceCode: "HOT-4821",
  roomId: "r1",
  roomNameSnapshot: "Classic Room",
  checkIn: new Date(2026, 8, 10),
  checkOut: new Date(2026, 8, 12),
};

function fakePrisma(found: typeof BOOKING | null) {
  const calls: { model: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      booking: {
        findFirst: vi.fn(async (args: Record<string, unknown>) => {
          calls.push({ model: "booking.findFirst", args });
          return found;
        }),
        update: vi.fn(async (args: Record<string, unknown>) => {
          calls.push({ model: "booking.update", args });
          return {};
        }),
      },
      contact: {
        update: vi.fn(async (args: Record<string, unknown>) => {
          calls.push({ model: "contact.update", args });
          return {};
        }),
      },
    } as unknown as PrismaClient,
  };
}
const dataOf = (calls: { model: string; args: Record<string, unknown> }[], model: string) =>
  (calls.find((c) => c.model === model)?.args as { data?: Record<string, unknown> } | undefined)?.data ?? {};

describe("finding a booking to manage", () => {
  it("excludes cancelled bookings and takes the newest", async () => {
    const { client, calls } = fakePrisma(BOOKING);
    await findActiveBooking(client, "t1", "c1");
    const where = calls[0].args.where as Record<string, unknown>;
    expect(where.status).toEqual({ not: "CANCELLED" });
    expect(calls[0].args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("returns null when there's nothing to manage", async () => {
    const { client } = fakePrisma(null);
    expect(await findActiveBooking(client, "t1", "c1")).toBeNull();
  });
});

describe("cancelling", () => {
  it("marks the booking cancelled rather than deleting it", async () => {
    // The row is the hotel's record that a booking existed and was called
    // off; staff need to see that. availability.ts already ignores
    // CANCELLED, so the room frees up immediately.
    const { client, calls } = fakePrisma(BOOKING);
    await cancelBooking(client, "t1", "c1", "b1");
    expect(dataOf(calls, "booking.update").status).toBe("CANCELLED");
    expect(calls.some((c) => c.model === "booking.delete")).toBe(false);
  });

  it("returns the guest to a warm lead, not a stranger", async () => {
    // Follow-up rules key off lead status — resetting to NEW would restart a
    // nurture sequence written for someone who has never spoken to the hotel.
    const { client, calls } = fakePrisma(BOOKING);
    await cancelBooking(client, "t1", "c1", "b1");
    const data = dataOf(calls, "contact.update");
    expect(data.leadStatus).toBe("INTERESTED");
    expect(data.bookingStatus).toBe("NONE");
  });

  it("clears the negotiation state so nothing stale is carried forward", async () => {
    const { client, calls } = fakePrisma(BOOKING);
    await cancelBooking(client, "t1", "c1", "b1");
    const data = dataOf(calls, "contact.update");
    expect(data.pendingRoomId).toBeNull();
    expect(data.pendingCheckIn).toBeNull();
    expect(data.pendingCheckOut).toBeNull();
  });
});

describe("rescheduling", () => {
  it("releases the old booking so the guest isn't competing with themselves", async () => {
    // Leaving the original active would have them blocked from the very room
    // they're trying to move.
    const { client, calls } = fakePrisma(BOOKING);
    await beginReschedule(client, "t1", "c1", BOOKING);
    expect(dataOf(calls, "booking.update").status).toBe("CANCELLED");
  });

  it("carries the room forward so only dates need re-picking", async () => {
    const { client, calls } = fakePrisma(BOOKING);
    await beginReschedule(client, "t1", "c1", BOOKING);
    const data = dataOf(calls, "contact.update");
    expect(data.pendingRoomId).toBe("r1");
    expect(data.pendingCheckIn).toBeNull();
    expect(data.pendingCheckOut).toBeNull();
  });
});

describe("recognising the request", () => {
  it("catches the ways guests ask", () => {
    for (const m of ["cancel my booking", "I want to cancel", "can I reschedule my booking?", "change my reservation"]) {
      expect(looksLikeExistingBookingRequest(m), m).toBe(true);
    }
  });

  it("does not fire on a new enquiry", () => {
    for (const m of ["I want to book a room", "do you have wifi", "2 people"]) {
      expect(looksLikeExistingBookingRequest(m), m).toBe(false);
    }
  });

  it("has distinct ids for the three actions", () => {
    expect(new Set([CANCEL_BOOKING_ID, CHANGE_DATES_ID, KEEP_BOOKING_ID]).size).toBe(3);
  });
});

describe("cancel then rebook", () => {
  it("the idempotency window ignores cancelled bookings", async () => {
    // Real bug, caught end-to-end the moment cancellation became reachable:
    // completeBooking's 5-minute idempotency lookup returned ANY recent
    // booking, so a guest who cancelled and rebooked straight away got the
    // cancelled row handed back — same reference code, status CANCELLED.
    // They would believe they held a reservation that did not exist, while
    // the room sat free for someone else to take.
    const { completeBooking } = await import("./complete-booking");
    let seenWhere: Record<string, unknown> = {};
    const prisma = {
      booking: {
        findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
          seenWhere = args.where;
          return null;
        }),
      },
      contact: { findUniqueOrThrow: vi.fn(async () => { throw new Error("stop here"); }) },
      hotelProfile: { findUnique: vi.fn(async () => null) },
      room: { findUnique: vi.fn(async () => null) },
    } as unknown as PrismaClient;

    await completeBooking(prisma, "t1", "c1", { checkIn: new Date(Date.now() + 86_400_000) }).catch(() => {});
    expect(seenWhere.status).toEqual({ not: "CANCELLED" });
  });
});

describe("the copy exists in every language", () => {
  it("covers the whole manage-booking flow", () => {
    for (const lang of ["en", "hi", "te"] as const) {
      const s = t(lang);
      expect(s.manageBookingBody("HOT-1", "Classic Room", "10 Sep")).toContain("HOT-1");
      expect(s.bookingCancelled("HOT-1")).toContain("HOT-1");
      expect(s.bookingKept("HOT-1")).toContain("HOT-1");
      for (const v of [s.manageCancel, s.manageChangeDates, s.manageKeep, s.rescheduleStart, s.noBookingFound, s.mediaNoticed, s.continueAnyway, s.farewell]) {
        expect(v.trim().length, `${lang} has an empty string`).toBeGreaterThan(0);
      }
    }
  });
});
