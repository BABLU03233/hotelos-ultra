"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [{ href: "/admin", label: "Tenants", icon: Building2 }] as const;

const COMING_SOON = [
  { label: "Billing", icon: CreditCard },
  { label: "Admins", icon: ShieldCheck },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/tenants");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
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
