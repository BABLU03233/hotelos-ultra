import { describe, expect, it, vi } from "vitest";
import { findUnavailableRoomIds, isRoomAvailable } from "./availability";
import type { PrismaClient } from "@/generated/prisma/client";

const CHECK_IN = new Date("2026-09-10T00:00:00Z");
const CHECK_OUT = new Date("2026-09-12T00:00:00Z");

/**
 * `rooms` is the hotel's stated inventory; `taken` is how many overlapping
 * bookings each room already has.
 */
function fakePrisma(
  rooms: { id: string; unitCount: number | null }[],
  taken: Record<string, number> = {},
  capture?: (args: unknown) => void
) {
  return {
    room: {
      findMany: vi.fn(async () => rooms.filter((r) => r.unitCount !== null)),
      findFirst: vi.fn(async (args: { where: { id: string } }) => rooms.find((r) => r.id === args.where.id) ?? null),
    },
    booking: {
      count: vi.fn(async (args: { where: { roomId: string } }) => taken[args.where.roomId] ?? 0),
      groupBy: vi.fn(async (args: unknown) => {
        capture?.(args);
        return Object.entries(taken).map(([roomId, n]) => ({ roomId, _count: { roomId: n } }));
      }),
    },
  } as unknown as PrismaClient;
}

describe("findUnavailableRoomIds", () => {
  it("returns nothing when no room states an inventory", async () => {
    // The bug this exists for. Availability assumed one physical room per
    // type, so a single booking of "Classic Room" removed Classic from every
    // other guest for those dates — a hotel with ten Classic rooms looked sold
    // out after one, and the guest was told September was full.
    const prisma = fakePrisma([{ id: "r1", unitCount: null }], { r1: 5 });
    expect((await findUnavailableRoomIds(prisma, "t1", CHECK_IN, CHECK_OUT)).size).toBe(0);
  });

  it("only excludes a room once every unit of it is taken", async () => {
    const prisma = fakePrisma(
      [
        { id: "full", unitCount: 2 },
        { id: "spare", unitCount: 5 },
      ],
      { full: 2, spare: 2 }
    );
    const out = await findUnavailableRoomIds(prisma, "t1", CHECK_IN, CHECK_OUT);
    expect([...out]).toEqual(["full"]);
  });

  it("treats over-booking as full rather than wrapping around", async () => {
    const prisma = fakePrisma([{ id: "r1", unitCount: 1 }], { r1: 3 });
    expect([...(await findUnavailableRoomIds(prisma, "t1", CHECK_IN, CHECK_OUT))]).toEqual(["r1"]);
  });

  it("asks for a genuine range overlap and ignores cancelled bookings", async () => {
    let seen: Record<string, unknown> = {};
    const prisma = fakePrisma([{ id: "r1", unitCount: 1 }], {}, (args) => {
      seen = (args as { where: Record<string, unknown> }).where;
    });
    await findUnavailableRoomIds(prisma, "t1", CHECK_IN, CHECK_OUT);
    // A booking starting exactly on this check-out date does not overlap.
    expect(seen.checkIn).toEqual({ lt: CHECK_OUT });
    expect(seen.checkOut).toEqual({ gt: CHECK_IN });
    expect(seen.status).toEqual({ not: "CANCELLED" });
  });
});

describe("isRoomAvailable", () => {
  it("is always true when the hotel has not stated an inventory", async () => {
    expect(await isRoomAvailable(fakePrisma([{ id: "r1", unitCount: null }], { r1: 9 }), "t1", "r1", CHECK_IN, CHECK_OUT)).toBe(true);
  });

  it("is true while a unit is still free", async () => {
    expect(await isRoomAvailable(fakePrisma([{ id: "r1", unitCount: 3 }], { r1: 2 }), "t1", "r1", CHECK_IN, CHECK_OUT)).toBe(true);
  });

  it("is false once every unit is taken", async () => {
    expect(await isRoomAvailable(fakePrisma([{ id: "r1", unitCount: 3 }], { r1: 3 }), "t1", "r1", CHECK_IN, CHECK_OUT)).toBe(false);
  });

  it("is true for a room this tenant does not have", async () => {
    // A stale or cross-tenant id must not read as "sold out".
    expect(await isRoomAvailable(fakePrisma([]), "t1", "gone", CHECK_IN, CHECK_OUT)).toBe(true);
  });
});
