"use client";

import { Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowUpActivity } from "@/components/follow-ups/follow-up-activity";
import { FollowUpRuleCard } from "@/components/follow-ups/follow-up-rule-card";
import { Reveal } from "@/components/motion/reveal";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { FollowUpRule } from "@/types";

export default function FollowUpsPage() {
  const { data, loading, reload } = useFetch<{ rules: FollowUpRule[] }>("/api/follow-up-rules");

  async function addRule() {
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
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Follow-up automation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              When a lead goes quiet, Aria works through these steps in order — cancelled automatically the moment they reply.
            </p>
          </div>
          <Button onClick={addRule}>
            <Plus /> Add step
          </Button>
        </div>
      </Reveal>

      <div className="flex flex-col gap-3">
        {loading || !data
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          : data.rules.map((rule, i) => (
              <FollowUpRuleCard key={rule.id} rule={rule} isLast={i === data.rules.length - 1} onChanged={reload} />
            ))}
        {!loading && data?.rules.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Clock className="size-8" />
            <p className="text-sm font-medium text-foreground">No follow-up steps yet</p>
            <p className="max-w-xs text-xs">Add a step to automatically nudge leads who go quiet.</p>
          </div>
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
