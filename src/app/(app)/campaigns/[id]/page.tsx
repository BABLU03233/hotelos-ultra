"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipientTable } from "@/components/campaigns/recipient-table";
import { Reveal } from "@/components/motion/reveal";
import { formatDateTime } from "@/lib/format";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { cn } from "@/lib/utils";
import { Campaign, CampaignReport } from "@/types";

const FUNNEL_COLORS = [
  "var(--color-chart-5)",
  "var(--color-chart-3)",
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-2)",
];

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, reload } = useFetch<{ campaign: Campaign; report: CampaignReport }>(`/api/campaigns/${params.id}`);
  const [rescheduleValue, setRescheduleValue] = React.useState("");
  const [rescheduling, setRescheduling] = React.useState(false);

  // These three all reach guests, so a silent failure is expensive in a way
  // a failed form save is not. Cancelling is the worst of them: the owner
  // believes they have stopped a broadcast, walks away, and it keeps sending.
  // Every one of them now says so, and reloads either way so the screen shows
  // the campaign as it actually is rather than as the click intended.
  async function send() {
    await saveWithFeedback(
      () => apiFetch(`/api/campaigns/${params.id}/send`, { method: "POST" }),
      "Couldn’t start that campaign"
    );
    reload();
  }

  async function cancelRemaining() {
    await saveWithFeedback(
      () => apiFetch(`/api/campaigns/${params.id}/cancel`, { method: "POST" }),
      "Couldn’t cancel the remaining sends — the campaign may still be going out"
    );
    reload();
  }

  async function cancelSchedule() {
    await saveWithFeedback(
      () => apiFetch(`/api/campaigns/${params.id}`, { method: "PATCH", body: JSON.stringify({ scheduledAt: null }) }),
      "Couldn’t cancel the schedule — it may still send at the planned time"
    );
    reload();
  }

  async function updateSchedule() {
    if (!rescheduleValue) return;
    setRescheduling(true);
    try {
      await apiFetch(`/api/campaigns/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduledAt: new Date(rescheduleValue).toISOString() }),
      });
      setRescheduleValue("");
      reload();
    } finally {
      setRescheduling(false);
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

  const { campaign, report } = data;
  const chartData = [
    { label: "Sent", value: report.sent },
    { label: "Delivered", value: report.delivered },
    { label: "Read", value: report.read },
    { label: "Replies", value: report.replies },
    { label: "Interested", value: report.interested },
    { label: "Booked", value: report.booked },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">
              {campaign.type} · {campaign.messageType.toLowerCase()}
            </p>
          </div>
          {!campaign.sentAt && (
            <Button onClick={send} disabled={report.totalContacts === 0}>
              Send now
            </Button>
          )}
          {campaign.sentAt && campaign.sendPacing === "SPACED" && report.pending > 0 && (
            <Button variant="outline" onClick={cancelRemaining}>
              Cancel remaining sends
            </Button>
          )}
        </div>
      </Reveal>

      {!campaign.sentAt && campaign.scheduledAt && (
        <Reveal>
          <Card>
            <CardContent className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarClock className="size-4 shrink-0 text-primary" />
                Scheduled to send automatically on {formatDateTime(campaign.scheduledAt)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  type="datetime-local"
                  value={rescheduleValue}
                  onChange={(e) => setRescheduleValue(e.target.value)}
                  className="w-56"
                />
                <Button size="sm" variant="outline" disabled={!rescheduleValue || rescheduling} onClick={updateSchedule}>
                  Reschedule
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelSchedule}>
                  Cancel schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {(
          [
            { label: "Total contacts", value: report.totalContacts },
            { label: "Sent", value: report.sent },
            { label: "Delivered", value: report.delivered },
            { label: "Read", value: report.read },
            { label: "Replies", value: report.replies },
            { label: "Interested", value: report.interested },
            { label: "Booked", value: report.booked },
            { label: "Failed", value: report.failed },
          ] satisfies { label: string; value: number }[]
        ).map(({ label, value }) => {
          const isFailed = label === "Failed" && value > 0;
          return (
            <Card key={label} className={isFailed ? "border-destructive/30" : undefined}>
              <CardContent>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("mt-1 text-xl font-semibold tabular-nums", isFailed && "text-destructive")}>{value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
              <Bar dataKey="value" radius={4}>
                {chartData.map((d, i) => (
                  <Cell key={d.label} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipientTable campaignId={campaign.id} />
        </CardContent>
      </Card>
    </div>
  );
}
