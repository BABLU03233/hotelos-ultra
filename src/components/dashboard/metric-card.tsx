import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Same 5-hue palette used everywhere else (charts, lead-status dots) — see globals.css chart-1..5. */
export type MetricTone = 1 | 2 | 3 | 4 | 5;

export function MetricCard({
  label,
  value,
  icon: Icon,
  previous,
  tone = 1,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  /** Comparable value for the prior period — renders a "+N vs yesterday" delta when provided. */
  previous?: number;
  tone?: MetricTone;
}) {
  const delta = previous !== undefined && typeof value === "number" ? value - previous : null;
  const toneVar = `var(--color-chart-${tone})`;

  return (
    <Card className="group/metric relative overflow-hidden transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5">
      <div
        className="absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{ background: toneVar }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover/metric:opacity-25"
        style={{ background: toneVar }}
        aria-hidden="true"
      />
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {delta !== null && (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-0.5 text-[11px] font-medium",
                delta > 0 ? "text-emerald-600" : delta < 0 ? "text-muted-foreground" : "text-muted-foreground"
              )}
            >
              {delta !== 0 &&
                (delta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
              {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta} vs yesterday`}
            </p>
          )}
        </div>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklch, ${toneVar}, transparent 85%)`, color: toneVar }}
        >
          <Icon className="size-4.5" />
        </span>
      </CardContent>
    </Card>
  );
}
