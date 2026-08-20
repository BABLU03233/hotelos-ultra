import Link from "next/link";
import { ArrowRight, LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedValue } from "@/components/dashboard/animated-value";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  icon: Icon,
  previous,
  href,
  hint,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  /** Comparable value for the prior period — renders a "+N vs yesterday" delta when provided. */
  previous?: number;
  /**
   * Where this number lives. A metric that names a set of conversations should
   * take you to them — reading "4 hot leads" and then having to find the CRM,
   * switch to Chats and pick the right filter is three steps to reach
   * something the card already knows the address of.
   */
  href?: string;
  /** Replaces the delta line where a comparison would be meaningless. */
  hint?: string;
}) {
  const delta = previous !== undefined && typeof value === "number" ? value - previous : null;

  const card = (
    <Card variant="flat" className={cn("h-full border-b border-border pb-4", href && "transition-colors hover:bg-muted/40")}>
      <CardContent className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Icon className="size-3.5" />
            {label}
            {href && <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />}
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
          {hint && delta === null && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="group block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
