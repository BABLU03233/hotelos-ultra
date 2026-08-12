import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OccupancyRow } from "@/lib/booking/occupancy";
import { cn } from "@/lib/utils";

/** "Wed 10" — the label above each night column. */
function dayLabel(iso: string): { weekday: string; day: string; isWeekend: boolean } {
  // Parsed as a plain calendar date, not an instant: these strings are
  // already India-local days (see isoDayIST), so re-interpreting them in the
  // server's timezone would shift the whole grid by one column.
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  return {
    weekday: date.toLocaleDateString("en-IN", { weekday: "short" }),
    day: String(d),
    isWeekend: dow === 0 || dow === 6,
  };
}

export function OccupancyCalendar({
  rows,
  days,
  occupancy,
  bookingCount,
}: {
  rows: OccupancyRow[];
  days: string[];
  occupancy: number;
  bookingCount: number;
}) {
  const todayIso = days[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next four weeks</CardTitle>
        <CardDescription>
          {bookingCount === 0
            ? "No bookings in this window yet — every room is free."
            : `${bookingCount} booking${bookingCount === 1 ? "" : "s"} · ${occupancy}% of room-nights sold`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Wide grid scrolls inside its own container so the page body never scrolls sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">Room</th>
                {days.map((iso) => {
                  const { weekday, day, isWeekend } = dayLabel(iso);
                  return (
                    <th
                      key={iso}
                      className={cn(
                        "min-w-9 px-0.5 py-1.5 text-center font-normal",
                        isWeekend ? "text-foreground" : "text-muted-foreground",
                        iso === todayIso && "rounded-t bg-primary/10 font-medium text-foreground"
                      )}
                    >
                      <div className="text-[10px] leading-tight">{weekday}</div>
                      <div className="leading-tight">{day}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.roomId}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card py-1 pr-3 pl-2 font-medium">{row.roomName}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.date} className="px-px py-1">
                      <div
                        title={
                          cell.booking
                            ? `${cell.booking.referenceCode}${cell.booking.contactName ? ` · ${cell.booking.contactName}` : ""}`
                            : `${row.roomName} free on ${cell.date}`
                        }
                        className={cn(
                          "h-6 w-full",
                          cell.booking
                            ? "bg-primary/80"
                            : "bg-muted/60",
                          // Rounded only at the ends of a run, so a multi-night
                          // stay reads as one continuous block rather than a
                          // row of separate squares.
                          cell.isStart && "rounded-l",
                          cell.booking && !cell.isStart ? "" : "rounded-r"
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm bg-primary/80" /> Booked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm bg-muted/60" /> Free
          </span>
          <span>Hover a block for its reference code.</span>
        </div>
      </CardContent>
    </Card>
  );
}
