"use client";

import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { SubscriptionStatus } from "@/types";

interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    slug: string;
    subscriptionStatus: SubscriptionStatus;
    planFeeInPaise: number;
    createdAt: string;
    whatsappPhoneNumberId: string | null;
    users: { id: string; name: string; email: string; role: "OWNER" | "STAFF"; createdAt: string }[];
    hotelProfile: { address: string | null } | null;
  };
  stats: {
    contactCount: number;
    roomCount: number;
    campaignCount: number;
    knowledgeDocCount: number;
    bookedCount: number;
    messageCount: number;
  };
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELLED: "Cancelled",
};

export default function AdminTenantDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, reload } = useFetch<TenantDetail>(`/api/admin/tenants/${params.id}`);

  async function updateStatus(subscriptionStatus: SubscriptionStatus) {
    try {
      await apiFetch(`/api/admin/tenants/${params.id}`, { method: "PATCH", body: JSON.stringify({ subscriptionStatus }) });
      reload();
      toast.success("Subscription status updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (loading || !data) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { tenant, stats } = data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground">
          {tenant.slug} · joined {formatDate(tenant.createdAt)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          ["Contacts", stats.contactCount],
          ["Booked", stats.bookedCount],
          ["Messages", stats.messageCount],
          ["Rooms", stats.roomCount],
          ["Campaigns", stats.campaignCount],
          ["KB docs", stats.knowledgeDocCount],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm">{formatMoney(tenant.planFeeInPaise / 100)} / month platform fee</p>
            <p className="text-xs text-muted-foreground">
              WhatsApp: {tenant.whatsappPhoneNumberId ? "connected" : "not connected"}
            </p>
          </div>
          <Select value={tenant.subscriptionStatus} onValueChange={(v) => v && updateStatus(v as SubscriptionStatus)}>
            <SelectTrigger className="w-40">
              <SelectValue>{(v: string) => STATUS_LABELS[v as SubscriptionStatus]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          {tenant.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
              <div>
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <Badge variant="outline">{u.role === "OWNER" ? "Owner" : "Staff"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
