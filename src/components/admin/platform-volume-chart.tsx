"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function PlatformVolumeChart({ trend }: { trend: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={trend} margin={{ left: -16, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDay} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
        <Tooltip
          labelFormatter={(label) => (typeof label === "string" ? formatDay(label) : label)}
          contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="count" name="Messages" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.12} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
