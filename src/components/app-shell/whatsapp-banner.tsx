import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/** Non-dismissible on purpose — nothing downstream (the AI agent, follow-ups, campaigns) works until this is fixed, so it should stay hard to miss. */
export function WhatsAppBanner({ agentName = "Anushka" }: { agentName?: string }) {
  return (
    <div className="relative flex items-center justify-center gap-2 overflow-hidden border-b border-amber-500/30 bg-[linear-gradient(90deg,color-mix(in_oklch,var(--color-chart-4),transparent_82%),color-mix(in_oklch,#f59e0b,transparent_82%),color-mix(in_oklch,var(--color-chart-4),transparent_82%))] px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:text-amber-300">
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
      </span>
      <TriangleAlert className="size-3.5 shrink-0" />
      {`WhatsApp isn't connected — ${agentName} can't send or receive messages.`}
      <Link href="/settings?tab=whatsapp" className="font-semibold underline underline-offset-2 hover:no-underline">
        Connect now →
      </Link>
    </div>
  );
}
