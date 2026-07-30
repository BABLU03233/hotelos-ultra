"use client";

import { useParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { Campaign, CampaignReport } from "@/types";

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, reload } = useFetch<{ campaign: Campaign; report: CampaignReport }>(`/api/campaigns/${params.id}`);

  async function send() {
    await apiFetch(`/api/campaigns/${params.id}/send`, { method: "POST" });
    reload();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {campaign.type} · {campaign.messageType.toLowerCase()}
          </p>
        </div>
        {!campaign.sentAt && (
          <Button onClick={send} disabled={report.totalContacts === 0}>
            Send now
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {[
          ["Total contacts", report.totalContacts],
          ["Sent", report.sent],
          ["Delivered", report.delivered],
          ["Read", report.read],
          ["Replies", report.replies],
          ["Interested", report.interested],
          ["Booked", report.booked],
          ["Failed", report.failed],
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
          <CardTitle>Funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
              <Bar dataKey="value" fill="var(--color-primary)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
