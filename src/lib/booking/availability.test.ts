import { describe, expect, it, vi } from "vitest";
import { findUnavailableRoomIds, isRoomAvailable } from "./availability";
import type { PrismaClient } from "@/generated/prisma/client";

const CHECK_IN = new Date("2026-09-10T00:00:00Z");
const CHECK_OUT = new Date("2026-09-12T00:00:00Z");

function fakePrisma(bookings: { roomId: string | null }[], capture?: (args: unknown) => void) {
  return {
    booking: {
      findMany: vi.fn(async (args: unknown) => {
        capture?.(args);
        return bookings;
      }),
      findFirst: vi.fn(async () => bookings[0] ?? null),
    },
  } as unknown as PrismaClient;
}

describe("findUnavailableRoomIds", () => {
  it("returns the ids of rooms already booked across the range", async () => {
    const prisma = fakePrisma([{ roomId: "r1" }, { roomId: "r3" }]);
    const taken = await findUnavailableRoomIds(prisma, "t1", CHECK_IN, CHECK_OUT);
    expect([...taken].sort()).toEqual(["r1", "r3"]);
  });

  it("returns an empty set when nothing overlaps", async () => {
    const taken = await findUnavailableRoomIds(fakePrisma([]), "t1", CHECK_IN, CHECK_OUT);
    expect(taken.size).toBe(0);
  });

  it("drops null roomIds rather than putting null in the set", async () => {
    // Legacy bookings predate the roomId column; they must not poison the set.
    const taken = await findUnavailableRoomIds(fakePrisma([{ roomId: null }, { roomId: "r2" }]), "t1", CHECK_IN, CHECK_OUT);
    expect([...taken]).toEqual(["r2"]);
  });

  it("asks for the same overlap window isRoomAvailable uses, and excludes cancelled bookings", async () => {
    let seen: Record<string, unknown> = {};
    const prisma = fakePrisma([], (args) => {
      seen = (args as { where: Record<string, unknown> }).where;
    });
    await findUnavailableRoomIds(prisma, "t1", CHECK_IN, CHECK_OUT);
    // A stay blocks another only if the ranges genuinely intersect: an
    // existing booking starting exactly on this check-out date does not.
    expect(seen.checkIn).toEqual({ lt: CHECK_OUT });
    expect(seen.checkOut).toEqual({ gt: CHECK_IN });
    expect(seen.status).toEqual({ not: "CANCELLED" });
    expect(seen.tenantId).toBe("t1");
  });
});

describe("isRoomAvailable", () => {
  it("is false when a conflicting booking exists", async () => {
    expect(await isRoomAvailable(fakePrisma([{ roomId: "r1" }]), "t1", "r1", CHECK_IN, CHECK_OUT)).toBe(false);
  });

  it("is true when nothing conflicts", async () => {
    expect(await isRoomAvailable(fakePrisma([]), "t1", "r1", CHECK_IN, CHECK_OUT)).toBe(true);
  });
});
