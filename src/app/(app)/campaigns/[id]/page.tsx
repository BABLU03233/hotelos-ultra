"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Copy, PenLine, ShieldCheck, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EditCampaignDialog } from "@/components/campaigns/edit-campaign-dialog";
import { RecipientTable } from "@/components/campaigns/recipient-table";
import { Reveal } from "@/components/motion/reveal";
import { formatDateTime } from "@/lib/format";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { campaignStatus, campaignStatusClass } from "@/lib/campaigns/status";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { toast } from "sonner";
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
  const router = useRouter();
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

  /**
   * Run this promotion again.
   *
   * Always a copy, never a re-send of this row: the recipient records are the
   * delivery history of what actually happened, and the copy has to go back
   * through review — otherwise "send again" would be a way to put unreviewed
   * copy in front of guests.
   */
  async function duplicate(which: "same" | "failed") {
    try {
      const { campaign: copy } = await apiFetch<{ campaign: Campaign }>(`/api/campaigns/${params.id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ recipients: which }),
      });
      toast.success("Copy created and sent for approval — open it to edit before it's reviewed.");
      router.push(`/campaigns/${copy.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t duplicate that campaign");
    }
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
  // Counts passed in so a campaign that reached nobody cannot show "Sent".
  const status = campaignStatus(campaign, { sent: report.sent, failed: report.failed });
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">
              {campaign.type} · {campaign.messageType.toLowerCase()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Edit sits next to Send for anything not yet sent and not yet
                approved. It is the other half of "send back for changes": the
                reviewer could ask for one, and until now the owner had nowhere
                on this screen to make it. Not offered once APPROVED, because
                that copy was reviewed as written — the server refuses it too. */}
            {!campaign.sentAt && campaign.approval !== "APPROVED" && (
              <EditCampaignDialog campaign={campaign} onSaved={reload} />
            )}
            {/* Disabled rather than hidden while a campaign waits for review.
                A vanished button reads as a bug; a disabled one next to the
                status card below explains itself. The server refuses
                unapproved sends regardless — this is the courtesy, not the
                guard. */}
            {!campaign.sentAt && (
              <Button onClick={send} disabled={report.totalContacts === 0 || campaign.approval !== "APPROVED"}>
                Send now
              </Button>
            )}
            {campaign.sentAt && campaign.sendPacing === "SPACED" && report.pending > 0 && (
              <Button variant="outline" onClick={cancelRemaining}>
                Cancel remaining sends
              </Button>
            )}
            {/* Running the same promotion again is a normal thing to want, and
                until now the only route was retyping the whole campaign. */}
            {campaign.sentAt && report.failed > 0 && (
              <Button variant="outline" onClick={() => duplicate("failed")}>
                Retry the {report.failed} that failed
              </Button>
            )}
            {campaign.sentAt && (
              <Button variant="outline" onClick={() => duplicate("same")}>
                <Copy className="size-4" /> Send again
              </Button>
            )}
          </div>
        </div>
      </Reveal>

      {/* A send that failed has to say why. The live case: a broadcast showed
          "Sent" while both recipients had silently failed WhatsApp's 24-hour
          rule, and nothing on this screen mentioned it. */}
      {report.failed > 0 && report.failures.length > 0 && (
        <Reveal>
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{`${report.failed} ${report.failed === 1 ? "message" : "messages"} couldn't be delivered`}</span>
              </p>
              <ul className="flex flex-col gap-1.5">
                {report.failures.map((fail) => (
                  <li key={fail.phone} className="text-xs">
                    <span className="font-medium">{fail.name || fail.phone}</span>
                    <span className="text-muted-foreground"> — {fail.reason}</span>
                  </li>
                ))}
              </ul>
              {report.failed > report.failures.length && (
                <p className="text-[11px] text-muted-foreground">
                  …and {report.failed - report.failures.length} more with the same kinds of problem.
                </p>
              )}
            </CardContent>
          </Card>
        </Reveal>
      )}

      {/* Where this campaign stands. Shown for anything not yet sent, because
          "why can't I send?" is the first question a held campaign raises and
          the owner should not have to ask it. */}
      {!campaign.sentAt && (
        <Reveal>
          <Card
            className={
              campaign.approval === "REJECTED" || campaign.approval === "CHANGES_REQUESTED"
                ? "border-destructive/30"
                : undefined
            }
          >
            <CardContent className="flex flex-col gap-1.5">
              <p className={cn("flex items-center gap-1.5 text-sm font-medium", campaignStatusClass(status.tone))}>
                {campaign.approval === "PENDING_REVIEW" ? (
                  <ShieldCheck className="size-4 shrink-0" />
                ) : campaign.approval === "REJECTED" ? (
                  <XCircle className="size-4 shrink-0" />
                ) : campaign.approval === "CHANGES_REQUESTED" ? (
                  <PenLine className="size-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="size-4 shrink-0" />
                )}
                {status.label}
              </p>
              {status.detail && <p className="text-sm text-muted-foreground">{status.detail}</p>}
              {(campaign.approval === "REJECTED" || campaign.approval === "CHANGES_REQUESTED") && campaign.reviewNote && (
                <p className="text-xs text-muted-foreground">
                  Reviewed by {campaign.reviewedByName ?? "our team"}
                  {campaign.reviewedAt ? ` on ${formatDateTime(campaign.reviewedAt)}` : ""}.
                </p>
              )}
              {/* The same automated notes the reviewer saw. Showing them to the
                  hotel turns a rejection into something they can fix without a
                  support conversation. */}
              {campaign.approval !== "APPROVED" && (campaign.autoReview?.concerns.length ?? 0) > 0 && (
                <ul className="mt-1 flex flex-col gap-1">
                  {campaign.autoReview!.concerns.map((concern, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{concern.issue}</span> {concern.suggestion}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </Reveal>
      )}

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
