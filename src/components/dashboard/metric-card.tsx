import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="relative overflow-hidden transition-shadow duration-300 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" aria-hidden="true" />
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
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
      </CardContent>
    </Card>
  );
}
