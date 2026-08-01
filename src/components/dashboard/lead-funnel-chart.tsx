"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LeadStatus } from "@/types";

const STAGE_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-up",
  BOOKED: "Booked",
  CLOSED: "Closed",
};

// Same hues used for lead-status dots throughout the CRM (contact-list-item,
// contact-detail) so a stage reads as the same color everywhere in the app.
const STAGE_COLOR: Record<LeadStatus, string> = {
  NEW: "#3b82f6",
  INTERESTED: "#f59e0b",
  FOLLOW_UP: "#8b5cf6",
  BOOKED: "#10b981",
  CLOSED: "#71717a",
};

export function LeadFunnelChart({ funnel }: { funnel: Record<LeadStatus, number> }) {
  const data = (Object.keys(STAGE_LABELS) as LeadStatus[]).map((status) => ({
    status,
    label: STAGE_LABELS[status],
    value: funnel[status],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={12} width={72} />
        <Tooltip
          cursor={{ fill: "var(--color-muted)" }}
          contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="value" radius={4} barSize={18}>
          {data.map((d) => (
            <Cell key={d.status} fill={STAGE_COLOR[d.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
