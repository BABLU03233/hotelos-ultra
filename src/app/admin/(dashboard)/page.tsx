"use client";

import Link from "next/link";
import { Building2, MessagesSquare, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTenantDialog } from "@/components/admin/new-tenant-dialog";
import { useFetch } from "@/hooks/use-fetch";
import { formatDate, formatMoney } from "@/lib/format";
import { AdminTenantSummary } from "@/types";

const STATUS_TONE: Record<AdminTenantSummary["subscriptionStatus"], string> = {
  TRIAL: "bg-blue-500/10 text-blue-600",
  ACTIVE: "bg-emerald-500/10 text-emerald-600",
  PAST_DUE: "bg-amber-500/10 text-amber-600",
  CANCELLED: "bg-muted text-muted-foreground",
};

export default function AdminTenantsPage() {
  const { data, loading, reload } = useFetch<{ tenants: AdminTenantSummary[] }>("/api/admin/tenants");

  const totalMRR = data?.tenants
    .filter((t) => t.subscriptionStatus === "ACTIVE" || t.subscriptionStatus === "TRIAL")
    .reduce((sum, t) => sum + t.planFeeInPaise, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Hotels</h1>
          <p className="text-sm text-muted-foreground">Every hotel running on HotelOS Ultra.</p>
        </div>
        <NewTenantDialog onCreated={reload} />
      </div>

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

      <div className="flex flex-col gap-3">
        {loading || !data
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          : data.tenants.map((t) => (
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
        {!loading && data?.tenants.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No hotels yet — onboard the first one.</p>
        )}
      </div>
    </div>
  );
}
