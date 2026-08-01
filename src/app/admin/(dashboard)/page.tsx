"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, MessagesSquare, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTenantDialog } from "@/components/admin/new-tenant-dialog";
import { PlatformVolumeChart } from "@/components/admin/platform-volume-chart";
import { Reveal } from "@/components/motion/reveal";
import { useFetch } from "@/hooks/use-fetch";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import { AdminTenantSummary, SubscriptionStatus } from "@/types";

const STATUS_TONE: Record<AdminTenantSummary["subscriptionStatus"], string> = {
  TRIAL: "bg-blue-500/10 text-blue-600",
  ACTIVE: "bg-emerald-500/10 text-emerald-600",
  PAST_DUE: "bg-amber-500/10 text-amber-600",
  CANCELLED: "bg-muted text-muted-foreground",
};

const STATUS_FILTERS: { key: SubscriptionStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "TRIAL", label: "Trial" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAST_DUE", label: "Past due" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default function AdminTenantsPage() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<SubscriptionStatus | "ALL">("ALL");
  const { data, loading, reload } = useFetch<{ tenants: AdminTenantSummary[] }>("/api/admin/tenants");
  const { data: statsData } = useFetch<{ messageVolumeTrend: { date: string; count: number }[] }>("/api/admin/stats");

  const filtered = (data?.tenants ?? []).filter((t) => {
    if (status !== "ALL" && t.subscriptionStatus !== status) return false;
    if (search && !`${t.name} ${t.owner?.name ?? ""} ${t.owner?.email ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalMRR = data?.tenants
    .filter((t) => t.subscriptionStatus === "ACTIVE" || t.subscriptionStatus === "TRIAL")
    .reduce((sum, t) => sum + t.planFeeInPaise, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold">Hotels</h1>
            <p className="text-sm text-muted-foreground">Every hotel running on HotelOS Ultra.</p>
          </div>
          <NewTenantDialog onCreated={reload} />
        </div>
      </Reveal>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Hotels</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{data?.tenants.length ?? "—"}</p>
            </div>
            <Building2 className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total contacts</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {data?.tenants.reduce((s, t) => s + t.contactCount, 0) ?? "—"}
              </p>
            </div>
            <MessagesSquare className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">MRR (trial + active)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totalMRR != null ? formatMoney(totalMRR / 100) : "—"}</p>
            </div>
            <Users className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform message volume — last 14 days</CardTitle>
        </CardHeader>
        <CardContent className="h-48">
          {statsData ? <PlatformVolumeChart trend={statsData.messageVolumeTrend} /> : <Skeleton className="h-full w-full" />}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hotels or owners…" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                status === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {loading || !data
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          : filtered.map((t) => (
              <Link key={t.id} href={`/admin/tenants/${t.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{t.name}</p>
                        <Badge className={STATUS_TONE[t.subscriptionStatus]} variant="outline">
                          {t.subscriptionStatus}
                        </Badge>
                        {!t.whatsappConnected && (
                          <Badge variant="outline" className="text-amber-600">
                            WhatsApp not connected
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.owner ? `${t.owner.name} · ${t.owner.email}` : "No owner"} · joined {formatDate(t.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-4 text-right text-xs text-muted-foreground">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.contactCount}</p>
                        contacts
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.bookedCount}</p>
                        booked
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.staffCount}</p>
                        staff
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
        {!loading && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {data?.tenants.length === 0 ? "No hotels yet — onboard the first one." : "No hotels match this filter."}
          </p>
        )}
      </div>
    </div>
  );
}
