"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, CircleAlert, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformVolumeChart } from "@/components/admin/platform-volume-chart";
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
    whatsappWabaId: string | null;
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
  messageVolumeTrend: { date: string; count: number }[];
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
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [fee, setFee] = React.useState("");

  async function updateTenant(body: Record<string, unknown>) {
    try {
      await apiFetch(`/api/admin/tenants/${params.id}`, { method: "PATCH", body: JSON.stringify(body) });
      reload();
      toast.success("Updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  function startEdit() {
    if (!data) return;
    setName(data.tenant.name);
    setFee(String(data.tenant.planFeeInPaise / 100));
    setEditing(true);
  }

  async function saveEdit() {
    await updateTenant({ name, planFeeInPaise: Math.round(Number(fee) * 100) });
    setEditing(false);
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
      <div className="flex items-start justify-between">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-48" />
            <Button size="sm" onClick={saveEdit}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{tenant.name}</h1>
              <button onClick={startEdit} className="text-muted-foreground hover:text-foreground">
                <Pencil className="size-3.5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {tenant.slug} · joined {formatDate(tenant.createdAt)}
            </p>
          </div>
        )}
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
          <CardTitle>Message volume — last 14 days</CardTitle>
        </CardHeader>
        <CardContent className="h-48">
          <PlatformVolumeChart trend={data.messageVolumeTrend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          {editing ? (
            <div className="flex items-center gap-1.5 text-sm">
              <span>₹</span>
              <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} className="h-8 w-24" />
              <span className="text-muted-foreground">/ month</span>
            </div>
          ) : (
            <p className="text-sm">{formatMoney(tenant.planFeeInPaise / 100)} / month platform fee</p>
          )}
          <Select value={tenant.subscriptionStatus} onValueChange={(v) => v && updateTenant({ subscriptionStatus: v })}>
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
          <CardTitle>WhatsApp connection</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {tenant.whatsappPhoneNumberId ? (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 className="size-4" /> Connected
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm text-amber-600">
              <CircleAlert className="size-4" /> Not connected
            </div>
          )}
          {tenant.whatsappPhoneNumberId && (
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p>
                Phone number ID: <span className="font-mono text-foreground">{tenant.whatsappPhoneNumberId}</span>
              </p>
              {tenant.whatsappWabaId && (
                <p>
                  WABA ID: <span className="font-mono text-foreground">{tenant.whatsappWabaId}</span>
                </p>
              )}
            </div>
          )}
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
