"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LeadSource } from "@/types";

const SOURCE_LABELS: Record<LeadSource, string> = {
  DIRECT: "Direct",
  META_AD: "Meta ad",
  COLD_IMPORT: "Cold import",
};

const SOURCE_COLOR: Record<LeadSource, string> = {
  DIRECT: "var(--color-chart-5)",
  META_AD: "var(--color-chart-1)",
  COLD_IMPORT: "var(--color-chart-3)",
};

export function LeadSourceChart({ bySource }: { bySource: Record<LeadSource, number> }) {
  const data = (Object.keys(SOURCE_LABELS) as LeadSource[]).map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    value: bySource[source],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={12} width={80} />
        <Tooltip
          cursor={{ fill: "var(--color-muted)" }}
          contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="value" radius={4} barSize={18}>
          {data.map((d) => (
            <Cell key={d.source} fill={SOURCE_COLOR[d.source]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
