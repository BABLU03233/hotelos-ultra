"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ADMIN_NAV_ITEMS } from "@/components/admin/admin-sidebar";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function AdminTopbar({ name }: { name: string }) {
  const router = useRouter();

  async function logout() {
    // The redirect happens whatever the server says.
    //
    // This used to await the call bare, so a failed request — an expired
    // session, a network blip, a 500 — threw before router.push ever ran and
    // left the user sitting on the page looking signed in. On a shared
    // machine at a hotel front desk, "Log out" silently doing nothing is the
    // worst possible failure: the next person inherits the session.
    //
    // The cookie is cleared server-side by the call; if that fails, sending
    // them to the sign-in page is still strictly better than pretending
    // nothing happened, and the middleware will reject the stale cookie on
    // the next protected request anyway.
    try {
      await apiFetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Intentionally swallowed — see above.
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="relative z-10 flex h-14 items-center justify-between rounded-none border-t-0 border-r-0 border-b border-l-0 border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-2">
        <MobileNav items={ADMIN_NAV_ITEMS} brandName="HotelOS Ultra — Admin" brandHref="/admin" />
        <Link href="/admin" className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_var(--primary)]">
            <span className="text-xs font-bold">H</span>
          </span>
          <span className="hidden font-heading text-sm font-semibold sm:inline">HotelOS Ultra — Admin</span>
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">{name}</span>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut /> Log out
        </Button>
      </div>
    </header>
  );
}
