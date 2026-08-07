"use client";

import { useParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipientTable } from "@/components/campaigns/recipient-table";
import { Reveal } from "@/components/motion/reveal";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
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

  async function send() {
    await apiFetch(`/api/campaigns/${params.id}/send`, { method: "POST" });
    reload();
  }

  async function cancelRemaining() {
    await apiFetch(`/api/campaigns/${params.id}/cancel`, { method: "POST" });
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
