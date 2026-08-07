"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#templates", label: "Templates" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="glass sticky top-0 z-40 flex h-16 items-center justify-between rounded-none border-t-0 border-r-0 border-l-0 px-4 md:px-8">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_var(--primary)]">
          <Sparkles className="size-4" />
        </span>
        <span className="font-heading text-lg font-semibold">HotelOS Ultra</span>
      </Link>

      <nav className="hidden items-center gap-6 md:flex">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            {l.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {loggedIn ? (
          <Button nativeButton={false} render={<Link href="/dashboard" />}>Go to dashboard</Button>
        ) : (
          <>
            <Button variant="ghost" nativeButton={false} render={<Link href="/login" />} className="hidden sm:inline-flex">
              Log in
            </Button>
            <Button nativeButton={false} render={<Link href="/register" />}>Start free trial</Button>
          </>
        )}
      </div>
    </header>
  );
}
