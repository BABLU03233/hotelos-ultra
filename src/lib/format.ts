export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(input: string | Date | null): string {
  if (!input) return "—";
  return new Date(input).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** "6:59 pm" — the only timestamp WhatsApp puts on a bubble. */
export function formatClockTime(input: string | Date | null): string {
  if (!input) return "";
  return new Date(input).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "Today" / "Yesterday" / "18 August 2026" — the day separator pill. */
export function formatDaySeparator(input: string | Date): string {
  const d = new Date(input);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** Calendar-day key, so consecutive messages can be grouped under one separator. */
export function dayKey(input: string | Date): string {
  const d = new Date(input);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatDateTime(input: string | Date | null): string {
  if (!input) return "—";
  return new Date(input).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatMinutesDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h`;
  return `${(minutes / (60 * 24)).toFixed(minutes % (60 * 24) ? 1 : 0)}d`;
}

/** "in 45m" / "due now" — for a future timestamp, e.g. a scheduled follow-up's runAt. */
export function formatCountdown(target: string | Date): string {
  const diffMinutes = Math.round((new Date(target).getTime() - Date.now()) / 60000);
  return diffMinutes > 0 ? `in ${formatMinutesDuration(diffMinutes)}` : "due now";
}

/** Hours elapsed since a timestamp — used to check WhatsApp's 24h reply window. */
export function hoursSince(input: string | Date): number {
  return (Date.now() - new Date(input).getTime()) / 3_600_000;
}

export function formatRelativeTime(input: string | Date | null): string {
  if (!input) return "—";
  const date = new Date(input);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  const future = diffSec < 0;

  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.345, "w"],
    [12, "mo"],
    [Number.POSITIVE_INFINITY, "y"],
  ];
  let value = abs;
  let unit = "s";
  for (const [size, label] of units) {
    if (value < size) {
      unit = label;
      break;
    }
    value = Math.floor(value / size);
    unit = label;
  }
  if (abs < 5) return "just now";
  return future ? `in ${value}${unit}` : `${value}${unit} ago`;
}
