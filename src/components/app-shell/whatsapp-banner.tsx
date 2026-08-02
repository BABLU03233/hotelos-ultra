import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/** Non-dismissible on purpose — nothing downstream (Aria, follow-ups, campaigns) works until this is fixed, so it should stay hard to miss. */
export function WhatsAppBanner() {
  return (
    <div className="relative flex items-center justify-center gap-2 overflow-hidden bg-[linear-gradient(90deg,color-mix(in_oklch,var(--mesh-d),transparent_78%),color-mix(in_oklch,#f59e0b,transparent_78%),color-mix(in_oklch,var(--mesh-d),transparent_78%))] px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:text-amber-300">
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
      </span>
      <TriangleAlert className="size-3.5 shrink-0" />
      WhatsApp isn&apos;t connected — Aria can&apos;t send or receive messages.
      <Link href="/settings?tab=whatsapp" className="font-semibold underline underline-offset-2 hover:no-underline">
        Connect now →
      </Link>
    </div>
  );
}
