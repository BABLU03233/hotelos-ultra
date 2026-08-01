import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/** Non-dismissible on purpose — nothing downstream (Aria, follow-ups, campaigns) works until this is fixed, so it should stay hard to miss. */
export function WhatsAppBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:text-amber-400">
      <TriangleAlert className="size-3.5 shrink-0" />
      WhatsApp isn&apos;t connected — Aria can&apos;t send or receive messages.
      <Link href="/settings?tab=whatsapp" className="underline underline-offset-2 hover:no-underline">
        Connect now →
      </Link>
    </div>
  );
}
