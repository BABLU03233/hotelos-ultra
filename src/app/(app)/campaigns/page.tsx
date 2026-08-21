"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ImportContactsDialog } from "@/components/campaigns/import-contacts-dialog";
import { NewCampaignDialog } from "@/components/campaigns/new-campaign-dialog";
import { Reveal } from "@/components/motion/reveal";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { StaggerItem } from "@/components/motion/stagger-item";
import { useFetch } from "@/hooks/use-fetch";
import { campaignStatus, campaignStatusClass } from "@/lib/campaigns/status";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useAuthStore } from "@/store/use-auth-store";
import { Campaign } from "@/types";

export default function CampaignsPage() {
  const { data, loading, reload } = useFetch<{ campaigns: Campaign[] }>("/api/campaigns");
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Bulk Sender</h1>
            <p className="mt-1 text-sm text-muted-foreground">Broadcast offers to selected guests — {agentName} takes over if they reply.</p>
          </div>
          {/* Import sits here rather than in the CRM because importing a list is
              the first step of a bulk send, not something you do while working a
              conversation — and this dialog can send to the imported list
              straight away, which is this screen's job, not the CRM's. */}
          <div className="flex flex-wrap items-center gap-2">
            <ImportContactsDialog onImported={reload} />
            <NewCampaignDialog onCreated={reload} />
          </div>
        </div>
      </Reveal>

      <div className="flex flex-col gap-3">
        <SkeletonSwap
          showSkeleton={loading || !data}
          skeleton={
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {data?.campaigns.map((c, i) => (
              <StaggerItem key={c.id} index={i}>
                <Link href={`/campaigns/${c.id}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.type} · {c._count?.recipients ?? 0} recipients · {formatDate(c.createdAt)}
                        </p>
                      </div>
                      {(() => {
                        const status = campaignStatus(c);
                        return (
                          <span className={cn("text-xs font-medium", campaignStatusClass(status.tone))}>
                            {status.label}
                          </span>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </div>
        </SkeletonSwap>
        {!loading && data?.campaigns.length === 0 && (
          <EmptyState
            icon={Megaphone}
            title="No bulk sends yet"
            description={`Broadcast an offer or update to a segment of your guests — ${agentName} handles any replies.`}
            className="py-16"
          />
        )}
      </div>
    </div>
  );
}
