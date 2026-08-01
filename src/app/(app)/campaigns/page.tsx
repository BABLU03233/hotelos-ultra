"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NewCampaignDialog } from "@/components/campaigns/new-campaign-dialog";
import { useFetch } from "@/hooks/use-fetch";
import { formatDate } from "@/lib/format";
import { Campaign } from "@/types";

export default function CampaignsPage() {
  const { data, loading, reload } = useFetch<{ campaigns: Campaign[] }>("/api/campaigns");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Broadcast offers to selected guests — Aria takes over if they reply.</p>
        </div>
        <NewCampaignDialog onCreated={reload} />
      </div>

      <div className="flex flex-col gap-3">
        {loading || !data
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          : data.campaigns.map((c) => (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.type} · {c._count?.recipients ?? 0} recipients · {formatDate(c.createdAt)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.sentAt ? "Sent" : "Draft"}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
        {!loading && data?.campaigns.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Megaphone className="size-8" />
            <p className="text-sm font-medium text-foreground">No campaigns yet</p>
            <p className="max-w-xs text-xs">Broadcast an offer or update to a segment of your guests — Aria handles any replies.</p>
          </div>
        )}
      </div>
    </div>
  );
}
