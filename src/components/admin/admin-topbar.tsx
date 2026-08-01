"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function AdminTopbar({ name }: { name: string }) {
  const router = useRouter();

  async function logout() {
    await apiFetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="glass relative z-10 flex h-14 items-center justify-between rounded-none border-t-0 border-r-0 border-l-0 px-4 md:px-6">
      <Link href="/admin" className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_var(--primary)]">
          <span className="text-xs font-bold">H</span>
        </span>
        <span className="font-heading text-sm font-semibold">HotelOS Ultra — Admin</span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{name}</span>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut /> Log out
        </Button>
      </div>
    </header>
  );
}
