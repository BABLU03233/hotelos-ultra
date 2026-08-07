"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFetch } from "@/hooks/use-fetch";
import { CampaignRecipient, CampaignRecipientStatus } from "@/types";

const STATUS_LABELS: Record<CampaignRecipientStatus | "ALL", string> = {
  ALL: "All statuses",
  PENDING: "Pending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  BOOKED: "Booked",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<CampaignRecipientStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  SENT: "bg-blue-500/10 text-blue-600",
  DELIVERED: "bg-blue-500/10 text-blue-600",
  READ: "bg-violet-500/10 text-violet-600",
  REPLIED: "bg-emerald-500/10 text-emerald-600",
  INTERESTED: "bg-amber-500/10 text-amber-600",
  BOOKED: "bg-emerald-500/10 text-emerald-600",
  FAILED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function RecipientTable({ campaignId }: { campaignId: string }) {
  const [status, setStatus] = React.useState<CampaignRecipientStatus | "ALL">("ALL");
  const params = status !== "ALL" ? `?status=${status}` : "";
  const { data, loading } = useFetch<{ recipients: CampaignRecipient[] }>(`/api/campaigns/${campaignId}/recipients${params}`);

  return (
    <div className="flex flex-col gap-3">
      <Select value={status} onValueChange={(v) => v && setStatus(v as CampaignRecipientStatus | "ALL")}>
        <SelectTrigger className="w-44">
          <SelectValue>{(v: string) => STATUS_LABELS[v as CampaignRecipientStatus | "ALL"]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading || !data ? (
        <Skeleton className="h-48 w-full" />
      ) : data.recipients.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No recipients match this filter.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Lead status</TableHead>
              <TableHead>Delivery status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recipients.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/crm?contact=${r.contact.id}`} className="hover:underline">
                    {r.contact.name || r.contact.phone}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">
                  {r.contact.leadStatus.replace("_", " ").toLowerCase()}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_TONE[r.status]} variant="outline">
                    {STATUS_LABELS[r.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
