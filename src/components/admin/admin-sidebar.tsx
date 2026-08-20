"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, Megaphone, ShieldCheck, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Tenants", icon: Building2 },
  { href: "/admin/campaigns", label: "Campaign review", icon: Megaphone },
  { href: "/admin/account", label: "Account", icon: UserCog },
] as const;

const COMING_SOON = [
  { label: "Billing", icon: CreditCard },
  { label: "Admins", icon: ShieldCheck },
] as const;

/**
 * `pendingReviews` is counted in the server layout and passed down rather than
 * fetched here. A review queue nobody knows is full is the same as no queue at
 * all — the operator needs the count without opening the screen, and one
 * server-side count on a page they were already loading beats a client poll.
 */
export function AdminSidebar({ pendingReviews = 0 }: { pendingReviews?: number }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col rounded-none border-y-0 border-r border-l-0 border-sidebar-border bg-sidebar md:flex">
      {/* Scrolls on its own if the nav ever outgrows a short window; the
          sidebar itself stays pinned either way. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/tenants");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_2px_12px_-2px_var(--primary)]"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
              {item.href === "/admin/campaigns" && pendingReviews > 0 && (
                <span
                  className={cn(
                    "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-500/15 text-amber-600"
                  )}
                >
                  {pendingReviews}
                </span>
              )}
            </Link>
          );
        })}

        <p className="mt-4 px-2.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Coming soon</p>
        {COMING_SOON.map((item) => (
          <span
            key={item.label}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground/50"
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </span>
        ))}
      </nav>
    </aside>
  );
}
