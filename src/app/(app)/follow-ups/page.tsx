"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowUpRuleCard } from "@/components/follow-ups/follow-up-rule-card";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            When a lead goes quiet, Aria works through these steps in order — cancelled automatically the moment they reply.
          </p>
        </div>
        <Button onClick={addRule}>
          <Plus /> Add rule
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {loading || !data
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          : data.rules.map((rule) => <FollowUpRuleCard key={rule.id} rule={rule} onChanged={reload} />)}
        {!loading && data?.rules.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No follow-up rules yet — add one to get started.</p>
        )}
      </div>
    </div>
  );
}
