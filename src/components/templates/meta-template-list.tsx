"use client";

import * as React from "react";
import { LayoutTemplate, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoCallout } from "@/components/shared/info-callout";
import { MetaTemplateBuilderDialog } from "@/components/templates/meta-template-builder-dialog";
import { StaggerItem } from "@/components/motion/stagger-item";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { MetaTemplate } from "@/types";

function statusTone(status: string): { label: string; className: string } {
  const s = status.toUpperCase();
  if (s.includes("APPROVED") || s.startsWith("ACTIVE")) return { label: status, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
  if (s.includes("REJECT") || s === "DISABLED" || s === "PAUSED") return { label: status, className: "border-destructive/30 bg-destructive/10 text-destructive" };
  return { label: status, className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" };
}

export function MetaTemplateList() {
  const { data, loading, reload } = useFetch<{ templates: MetaTemplate[] }>("/api/wa-templates");
  const [syncing, setSyncing] = React.useState(false);
  const [refreshingId, setRefreshingId] = React.useState<string | null>(null);

  async function refresh(id: string) {
    setRefreshingId(id);
    try {
      await apiFetch(`/api/wa-templates/${id}/refresh`, { method: "POST" });
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/api/wa-templates/${id}`, { method: "DELETE" });
    reload();
  }

  async function syncFromMeta() {
    setSyncing(true);
    try {
      const result = await apiFetch<{ imported: number; updated: number }>("/api/wa-templates/sync", { method: "POST" });
      toast.success(`Synced: ${result.imported} imported, ${result.updated} updated`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="flex flex-col gap-3">
      <InfoCallout title="Real Meta-approved templates" tone="info">
        Created here, submitted directly to Meta for review. Once a template shows <strong>Approved</strong>, it can be selected wherever a template is
        needed — Campaigns, Follow-ups, and re-engagement on contact import — to reach guests outside the 24-hour window.
      </InfoCallout>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={syncFromMeta} disabled={syncing}>
          <RefreshCw className={syncing ? "animate-spin" : ""} /> Sync from Meta
        </Button>
        <MetaTemplateBuilderDialog onCreated={reload} />
      </div>

      {data?.templates.length === 0 && (
        <EmptyState
          icon={LayoutTemplate}
          title="No Meta templates yet"
          description="Create one, or sync if you already approved one directly in Meta Business Manager."
          className="py-8"
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data?.templates.map((t, i) => {
          const tone = statusTone(t.status);
          const body = t.components.find((c) => String(c.type).toUpperCase() === "BODY") as { text?: string } | undefined;
          return (
            <StaggerItem key={t.id} index={i}>
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.category} · {t.language} · added {formatDate(t.createdAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className={tone.className}>
                      {tone.label}
                    </Badge>
                  </div>
                  {body?.text && <p className="line-clamp-2 text-xs text-muted-foreground">{body.text}</p>}
                  {t.rejectionReason && <p className="text-[11px] text-destructive">Rejected: {t.rejectionReason}</p>}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refresh(t.id)} disabled={refreshingId === t.id || !t.metaTemplateId}>
                      <RotateCw className={refreshingId === t.id ? "animate-spin" : ""} /> Refresh status
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(t.id)} className="ml-auto">
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          );
        })}
      </div>
    </div>
  );
}
