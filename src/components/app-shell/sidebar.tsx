"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";

export function Sidebar({ hotelName }: { hotelName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col rounded-none border-y-0 border-r border-l-0 border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-[linear-gradient(135deg,var(--color-chart-1),var(--color-chart-3))] text-white shadow-[0_2px_10px_-2px_var(--color-chart-1)]">
          <Sparkles className="size-3.5" />
        </span>
        <span className="truncate font-heading text-sm font-semibold">{hotelName}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const toneVar = item.tone ? `var(--color-chart-${item.tone})` : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-sm font-medium transition-all duration-200",
                active
                  ? "font-semibold"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              )}
              style={
                active
                  ? toneVar
                    ? {
                        background: `color-mix(in oklch, ${toneVar}, transparent 88%)`,
                        borderLeftColor: toneVar,
                        color: toneVar,
                      }
                    : { background: "var(--muted)", borderLeftColor: "var(--muted-foreground)", color: "var(--foreground)" }
                  : undefined
              }
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
