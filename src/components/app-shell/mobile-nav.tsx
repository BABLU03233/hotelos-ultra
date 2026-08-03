"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LucideIcon, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Hamburger + slide-out nav for < md screens — the sidebar (md:flex) is hidden below that breakpoint with no other way to navigate. */
export function MobileNav({
  items,
  brandName,
  brandHref,
}: {
  items: readonly { href: string; label: string; icon: LucideIcon }[];
  brandName: string;
  brandHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu />
            <span className="sr-only">Open menu</span>
          </Button>
        }
      />
      <SheetContent side="left" className="w-64 gap-0 p-0">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>
            <Link href={brandHref} onClick={() => setOpen(false)} className="truncate">
              {brandName}
            </Link>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-2 text-sm tracking-wide transition-all duration-200",
                  active
                    ? "bg-[color-mix(in_oklch,var(--primary),transparent_88%)] font-semibold text-primary"
                    : "font-normal text-muted-foreground/80 hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-nav-indicator"
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
      </SheetContent>
    </Sheet>
  );
}
