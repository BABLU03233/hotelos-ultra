"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";

export function Sidebar({ hotelName }: { hotelName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col rounded-none border-y-0 border-r border-l-0 border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_var(--primary)]">
          <Sparkles className="size-3.5" />
        </span>
        <span className="truncate font-heading text-sm font-semibold">{hotelName}</span>
      </div>

      {/* Scrolls on its own if the nav ever outgrows a short window; the
          sidebar itself stays pinned either way. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-sm tracking-wide transition-all duration-200",
                active
                  ? "bg-[color-mix(in_oklch,var(--primary),transparent_88%)] font-semibold text-primary"
                  : "font-normal text-muted-foreground/80 hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-nav-indicator"
                  className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-primary"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
