import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedValue } from "@/components/dashboard/animated-value";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  icon: Icon,
  previous,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  /** Comparable value for the prior period — renders a "+N vs yesterday" delta when provided. */
  previous?: number;
}) {
  const delta = previous !== undefined && typeof value === "number" ? value - previous : null;

  return (
    <Card variant="flat" className="border-b border-border pb-4">
      <CardContent className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Icon className="size-3.5" />
            {label}
          </p>
          <AnimatedValue value={value} className="mt-2 text-5xl font-semibold tracking-tight tabular-nums" />
          {delta !== null && (
            <p
              className={cn(
                "mt-1.5 flex items-center gap-0.5 text-[11px] font-medium",
                delta > 0 ? "text-emerald-600" : delta < 0 ? "text-muted-foreground" : "text-muted-foreground"
              )}
            >
              {delta !== 0 &&
                (delta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
              {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta} vs yesterday`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
