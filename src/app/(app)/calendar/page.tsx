import { CalendarRange } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { OccupancyCalendar } from "@/components/calendar/occupancy-calendar";
import { getSessionFromCookies } from "@/lib/auth/session";
import { buildOccupancyGrid, dayRange, occupancyRate } from "@/lib/booking/occupancy";
import { todayMidnightIST } from "@/lib/india-time";
import { prisma } from "@/lib/prisma";

/** Nights shown at once — four weeks reads as a planning horizon without needing horizontal paging on a laptop. */
const WINDOW_NIGHTS = 28;

export default async function CalendarPage() {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const start = todayMidnightIST();
  const days = dayRange(start, WINDOW_NIGHTS);
  const windowEnd = new Date(start.getTime() + WINDOW_NIGHTS * 86_400_000);

  const [rooms, bookings] = await Promise.all([
    prisma.room.findMany({ where: { tenantId: session.tenantId }, orderBy: { price: "asc" }, select: { id: true, name: true } }),
    // Only stays that actually overlap the window — the same half-open
    // overlap rule availability.ts uses, so the calendar and what Anushka
    // tells a guest can never disagree.
    prisma.booking.findMany({
      where: {
        tenantId: session.tenantId,
        status: { not: "CANCELLED" },
        checkIn: { lt: windowEnd },
        checkOut: { gt: start },
      },
      select: {
        id: true,
        roomId: true,
        referenceCode: true,
        status: true,
        checkIn: true,
        checkOut: true,
        contact: { select: { name: true, phone: true } },
      },
    }),
  ]);

  const rows = buildOccupancyGrid(
    rooms,
    bookings.map((b) => ({
      id: b.id,
      roomId: b.roomId,
      referenceCode: b.referenceCode,
      status: b.status,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      contactName: b.contact?.name || b.contact?.phone || null,
    })),
    days
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Reveal>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every room, every night for the next four weeks — the same availability Anushka checks before she recommends a room.
          </p>
        </div>
      </Reveal>

      {rooms.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No rooms yet"
          description="Add your rooms in Settings → Rooms and they'll appear here with their bookings."
        />
      ) : (
        <OccupancyCalendar rows={rows} days={days} occupancy={occupancyRate(rows)} bookingCount={bookings.length} />
      )}
    </div>
  );
}
