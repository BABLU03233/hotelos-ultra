"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { initials } from "@/lib/format";

export function UserMenu({ name, email }: { name: string; email: string }) {
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
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Intentionally swallowed — see above.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar className="size-8 cursor-pointer">
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
