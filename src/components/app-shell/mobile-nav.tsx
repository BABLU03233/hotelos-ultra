"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_2px_12px_-2px_var(--primary)]"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                )}
              >
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
