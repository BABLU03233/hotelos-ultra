"use client";

import { MobileNav } from "@/components/app-shell/mobile-nav";
import { NAV_ITEMS } from "@/components/app-shell/nav-config";
import { UserMenu } from "@/components/app-shell/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { HelpButton } from "@/components/app-shell/help-button";

/**
 * Client wrapper around the app header's interactive pieces. NAV_ITEMS carries Lucide icon
 * component references (functions), which can't be passed as props from the Server Component
 * layout to a Client Component — so this imports them itself instead, same as Sidebar/AdminTopbar.
 */
export function AppHeader({
  hotelName,
  userName,
  userEmail,
}: {
  hotelName: string;
  userName: string;
  userEmail: string;
}) {
  return (
    <header className="relative z-10 flex h-14 items-center gap-1 rounded-none border-t-0 border-r-0 border-b border-l-0 border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <MobileNav items={NAV_ITEMS} brandName={hotelName} brandHref="/dashboard" />
        <span className="truncate font-heading text-sm font-semibold">{hotelName}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <HelpButton />
        <ThemeToggle />
        <NotificationBell />
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  );
}
