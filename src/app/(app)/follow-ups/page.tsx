"use client";

import * as React from "react";
import { Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FollowUpActivity } from "@/components/follow-ups/follow-up-activity";
import { FollowUpRuleCard } from "@/components/follow-ups/follow-up-rule-card";
import { Reveal } from "@/components/motion/reveal";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { StaggerItem } from "@/components/motion/stagger-item";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { FollowUpRule } from "@/types";

export default function FollowUpsPage() {
  const { data, loading, reload } = useFetch<{ rules: FollowUpRule[] }>("/api/follow-up-rules");
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");
  const [addingRule, setAddingRule] = React.useState(false);

  async function addRule() {
    // Guards against a double-click firing two POSTs before the first
    // response lands — each duplicate step means a guest gets several
    // near-identical messages when it fires, which is exactly the pattern
    // that risks a spam flag / block from Meta.
    if (addingRule) return;
    setAddingRule(true);
    try {
      const nextOrder = (data?.rules.at(-1)?.order ?? 0) + 1;
      await apiFetch("/api/follow-up-rules", {
        method: "POST",
        body: JSON.stringify({
          order: nextOrder,
          delayMinutes: 60,
          action: "REMINDER",
          messageBody: "Just checking in — still interested in booking with us?",
        }),
      });
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add step");
    } finally {
      setAddingRule(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Follow-up automation</h1>
            <p className="mt-1 text-sm text-muted-foreground">When a lead goes quiet, {agentName} works through these steps in order — cancelled automatically the moment they reply.</p>
          </div>
          <Button onClick={addRule} disabled={addingRule}>
            <Plus /> Add step
          </Button>
        </div>
      </Reveal>

      <div className="flex flex-col gap-3">
        <SkeletonSwap
          showSkeleton={loading || !data}
          skeleton={
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {data?.rules.map((rule, i) => (
              <StaggerItem key={rule.id} index={i}>
                <FollowUpRuleCard rule={rule} isLast={i === data.rules.length - 1} onChanged={reload} />
              </StaggerItem>
            ))}
          </div>
        </SkeletonSwap>
        {!loading && data?.rules.length === 0 && (
          <EmptyState
            icon={Clock}
            title="No follow-up steps yet"
            description="Add a step to automatically nudge leads who go quiet."
            className="py-16"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <FollowUpActivity />
        </CardContent>
      </Card>
    </div>
  );
}
