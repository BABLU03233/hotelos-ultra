"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CampaignPerformanceChart({
  campaigns,
}: {
  campaigns: { id: string; name: string; sent: number; replies: number }[];
}) {
  const data = campaigns.map((c) => ({
    name: c.name.length > 14 ? `${c.name.slice(0, 14)}…` : c.name,
    Sent: c.sent,
    Replies: c.replies,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
        <Tooltip
          cursor={{ fill: "var(--color-muted)" }}
          contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar dataKey="Sent" fill="var(--color-chart-5)" radius={3} />
        <Bar dataKey="Replies" fill="var(--color-chart-2)" radius={3} />
      </BarChart>
    </ResponsiveContainer>
  );
}
