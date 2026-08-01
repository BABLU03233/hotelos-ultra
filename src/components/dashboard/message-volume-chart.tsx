"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SERIES = [
  { key: "inbound", label: "From guests", color: "#3b82f6" },
  { key: "ai", label: "Aria replies", color: "#8b5cf6" },
  { key: "staff", label: "Staff replies", color: "#10b981" },
] as const;

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function MessageVolumeChart({ trend }: { trend: { date: string; inbound: number; ai: number; staff: number }[] }) {
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
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stackId="1"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.18}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
