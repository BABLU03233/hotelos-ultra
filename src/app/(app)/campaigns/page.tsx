"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { NewCampaignDialog } from "@/components/campaigns/new-campaign-dialog";
import { Reveal } from "@/components/motion/reveal";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { StaggerItem } from "@/components/motion/stagger-item";
import { useFetch } from "@/hooks/use-fetch";
import { formatDate } from "@/lib/format";
import { useAuthStore } from "@/store/use-auth-store";
import { Campaign } from "@/types";

export default function CampaignsPage() {
  const { data, loading, reload } = useFetch<{ campaigns: Campaign[] }>("/api/campaigns");
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Campaigns</h1>
            <p className="mt-1 text-sm text-muted-foreground">Broadcast offers to selected guests — {agentName} takes over if they reply.</p>
          </div>
          <NewCampaignDialog onCreated={reload} />
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
                      <span
                        className={
                          c.sentAt
                            ? "text-xs font-medium text-emerald-600"
                            : c.scheduledAt
                              ? "text-xs font-medium text-amber-600"
                              : "text-xs text-muted-foreground"
                        }
                      >
                        {c.sentAt ? "Sent" : c.scheduledAt ? "Scheduled" : "Draft"}
                      </span>
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
            title="No campaigns yet"
            description={`Broadcast an offer or update to a segment of your guests — ${agentName} handles any replies.`}
            className="py-16"
          />
        )}
      </div>
    </div>
  );
}
