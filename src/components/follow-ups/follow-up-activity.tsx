"use client";

import Link from "next/link";
import { CheckCircle2, CircleSlash, History, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { useFetch } from "@/hooks/use-fetch";
import { formatDateTime } from "@/lib/format";
import { FollowUpAction, ScheduledFollowUp } from "@/types";

const ACTION_LABELS: Record<FollowUpAction, string> = {
  REMINDER: "Reminder",
  OFFER: "Offer",
  PACKAGE: "Package",
  LAST: "Last follow-up",
};

const STATUS_META = {
  SENT: { icon: CheckCircle2, label: "Sent", tone: "text-emerald-600" },
  SKIPPED: { icon: CircleSlash, label: "Skipped (outside 24h window, no template)", tone: "text-amber-600" },
  CANCELLED: { icon: XCircle, label: "Cancelled (guest replied)", tone: "text-muted-foreground" },
} as const;

export function FollowUpActivity() {
  const { data, loading } = useFetch<{ activity: ScheduledFollowUp[] }>("/api/follow-up-rules/activity");

  return (
    <SkeletonSwap
      showSkeleton={loading || !data}
      skeleton={
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      }
    >
      {data?.activity.length === 0 ? (
        <EmptyState icon={History} title="No follow-ups have run yet" className="py-8" />
      ) : (
        <div className="flex flex-col">
          {data?.activity.map((f) => {
            const meta = STATUS_META[f.status as keyof typeof STATUS_META];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div key={f.id} className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-0">
                <Icon className={`size-3.5 shrink-0 ${meta.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs">
                    <span className="font-medium">{ACTION_LABELS[f.rule.action]}</span> to{" "}
                    {f.contact ? (
                      <Link href={`/crm?contact=${f.contact.id}`} className="hover:underline">
                        {f.contact.name || f.contact.phone}
                      </Link>
                    ) : (
                      "a contact"
                    )}
                  </p>
                  <p className={`text-[10px] ${meta.tone}`}>{meta.label}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(f.runAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </SkeletonSwap>
  );
}
