"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, PenLine, Send, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/motion/reveal";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

interface ReviewConcern {
  severity: "block" | "warn" | "note";
  issue: string;
  suggestion: string;
}

interface AdminCampaign {
  id: string;
  name: string;
  type: string;
  messageType: string;
  previewText: string | null;
  mediaUrl: string | null;
  approval: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  autoReview: { verdict: string; concerns: ReviewConcern[]; checkedAt: string } | null;
  scheduledAt: string | null;
  sentAt: string | null;
  tenant: { id: string; name: string; slug: string };
  templateMeta: { name: string; category: string; language: string } | null;
  recipientCount: number;
}

const TABS = [
  { key: "PENDING_REVIEW", label: "Waiting for review" },
  { key: "APPROVED", label: "Approved" },
  { key: "CHANGES_REQUESTED", label: "Sent back" },
  { key: "REJECTED", label: "Rejected" },
] as const;

const SEVERITY_STYLE: Record<ReviewConcern["severity"], { tone: string; Icon: typeof Info }> = {
  block: { tone: "text-red-600", Icon: ShieldAlert },
  warn: { tone: "text-amber-600", Icon: AlertTriangle },
  note: { tone: "text-muted-foreground", Icon: Info },
};

const VERDICT_STYLE: Record<string, { label: string; tone: string }> = {
  "looks-good": { label: "Automated check: looks good", tone: "bg-emerald-500/10 text-emerald-600" },
  "needs-changes": { label: "Automated check: needs changes", tone: "bg-amber-500/10 text-amber-600" },
  "do-not-send": { label: "Automated check: do not send", tone: "bg-red-500/10 text-red-600" },
};

export default function AdminCampaignReviewPage() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["key"]>("PENDING_REVIEW");
  const { data, loading, reload } = useFetch<{ campaigns: AdminCampaign[] }>(`/api/admin/campaigns?status=${tab}`);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const campaigns = data?.campaigns ?? [];

  async function decide(campaign: AdminCampaign, decision: "APPROVE" | "REQUEST_CHANGES" | "REJECT") {
    const note = notes[campaign.id]?.trim();
    if (decision !== "APPROVE" && !note) {
      toast.error("Add a note saying what needs to change — the hotel sees it.");
      return;
    }

    setBusyId(campaign.id);
    const ok = await saveWithFeedback(
      () =>
        apiFetch(`/api/admin/campaigns/${campaign.id}/review`, {
          method: "POST",
          body: JSON.stringify({ decision, note: note || undefined }),
        }),
      "Couldn't record that decision"
    );
    setBusyId(null);

    if (ok) {
      toast.success(
        decision === "APPROVE"
          ? `Approved — ${campaign.tenant.name} can now send to ${campaign.recipientCount} contacts.`
          : decision === "REQUEST_CHANGES"
            ? `Sent back to ${campaign.tenant.name} to fix and resubmit.`
            : `Rejected — ${campaign.tenant.name} will see your note.`
      );
      setNotes((n) => ({ ...n, [campaign.id]: "" }));
      reload();
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Reveal>
        <div>
          <h1 className="font-heading text-xl font-semibold">Campaign review</h1>
          <p className="text-sm text-muted-foreground">
            Every broadcast waits here before it reaches guests. Complaints land on the shared WhatsApp quality rating,
            so one careless blast slows delivery for every hotel.
          </p>
        </div>
      </Reveal>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {loading && !data ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)
        ) : campaigns.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {tab === "PENDING_REVIEW" ? "Nothing waiting — the queue is clear." : "Nothing here yet."}
          </p>
        ) : (
          campaigns.map((c) => {
            const verdict = c.autoReview ? VERDICT_STYLE[c.autoReview.verdict] : null;
            const concerns = c.autoReview?.concerns ?? [];

            return (
              <Card key={c.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.tenant.name} · {c.recipientCount} recipient{c.recipientCount === 1 ? "" : "s"} ·{" "}
                        {c.messageType === "TEMPLATE" && c.templateMeta
                          ? `template "${c.templateMeta.name}" (${c.templateMeta.category})`
                          : c.messageType.toLowerCase()}
                        {c.submittedAt ? ` · submitted ${formatDate(c.submittedAt)}` : ""}
                      </p>
                    </div>
                    {verdict && (
                      <Badge variant="outline" className={verdict.tone}>
                        {verdict.label}
                      </Badge>
                    )}
                  </div>

                  {/* What the guest actually receives — reviewing anything else
                      would be reviewing the wrong artefact. */}
                  <div className="rounded-lg bg-[#d9fdd3] p-3 text-sm whitespace-pre-wrap text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]">
                    {c.previewText?.trim() || <span className="italic opacity-60">No message body</span>}
                  </div>

                  {c.scheduledAt && (
                    <p className="text-xs text-muted-foreground">
                      Scheduled for {formatDate(c.scheduledAt)} — it will go out on its own once approved.
                    </p>
                  )}

                  {concerns.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                      {concerns.map((concern, i) => {
                        const { tone, Icon } = SEVERITY_STYLE[concern.severity] ?? SEVERITY_STYLE.note;
                        return (
                          <li key={i} className="flex gap-2 text-xs">
                            <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} />
                            <span>
                              <span className="font-medium">{concern.issue}</span>{" "}
                              <span className="text-muted-foreground">{concern.suggestion}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {c.approval === "PENDING_REVIEW" ? (
                    <div className="flex flex-col gap-2 border-t pt-3">
                      <Textarea
                        value={notes[c.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                        placeholder="Note to the hotel — required unless you're approving"
                        rows={2}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busyId === c.id} onClick={() => decide(c, "APPROVE")}>
                          <CheckCircle2 className="size-4" />
                          Approve
                        </Button>
                        {/* The missing middle option. Without it, a reviewer
                            who wanted one word changed had only Approve or
                            Reject — and what happened live was an approval
                            with "just change X" typed in the note, so the
                            broadcast went out unchanged and the requested
                            edit became a note nobody would ever act on. */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === c.id}
                          onClick={() => decide(c, "REQUEST_CHANGES")}
                        >
                          <PenLine className="size-4" />
                          Send back for changes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === c.id}
                          onClick={() => decide(c, "REJECT")}
                        >
                          <XCircle className="size-4" />
                          Reject
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Approving unlocks sending — it doesn&apos;t send, and it sends the copy exactly as written above. If you want
                        anything changed, send it back instead.
                      </p>
                    </div>
                  ) : (
                    <div className="border-t pt-3 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5">
                        {c.approval === "APPROVED" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        ) : c.approval === "CHANGES_REQUESTED" ? (
                          <PenLine className="size-3.5 text-amber-600" />
                        ) : (
                          <XCircle className="size-3.5 text-red-600" />
                        )}
                        {c.approval === "APPROVED"
                          ? "Approved"
                          : c.approval === "CHANGES_REQUESTED"
                            ? "Sent back for changes"
                            : "Rejected"}
                        {c.reviewedByName ? ` by ${c.reviewedByName}` : ""}
                        {c.reviewedAt ? ` on ${formatDate(c.reviewedAt)}` : ""}
                        {c.sentAt && (
                          <>
                            <Send className="ml-1.5 size-3.5" /> sent {formatDate(c.sentAt)}
                          </>
                        )}
                      </p>
                      {c.reviewNote && <p className="mt-1 italic">&ldquo;{c.reviewNote}&rdquo;</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
