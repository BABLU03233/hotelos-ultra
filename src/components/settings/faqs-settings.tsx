"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { Faq } from "@/types";

function FaqRow({ faq, onChanged }: { faq: Faq; onChanged: () => void }) {
  const [question, setQuestion] = React.useState(faq.question);
  const [answer, setAnswer] = React.useState(faq.answer);

  async function save() {
    if (question === faq.question && answer === faq.answer) return;
    await apiFetch(`/api/settings/faqs/${faq.id}`, { method: "PATCH", body: JSON.stringify({ question, answer }) });
    onChanged();
  }

  async function remove() {
    await apiFetch(`/api/settings/faqs/${faq.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="flex items-start gap-2 border-b border-border py-3 last:border-0">
      <div className="flex flex-1 flex-col gap-2">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} onBlur={save} placeholder="Question" />
        <Input value={answer} onChange={(e) => setAnswer(e.target.value)} onBlur={save} placeholder="Answer" />
      </div>
      <Button variant="ghost" size="icon-sm" onClick={remove}>
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  );
}

export function FaqsSettings() {
  const { data, loading, reload } = useFetch<{ faqs: Faq[] }>("/api/settings/faqs");

  async function addFaq() {
    await apiFetch("/api/settings/faqs", {
      method: "POST",
      body: JSON.stringify({ question: "New question", answer: "New answer" }),
    });
    reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Frequently asked questions</CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <Skeleton className="h-32 w-full" />
        ) : data.faqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No FAQs yet — Aria escalates more often without them.</p>
        ) : (
          <div className="flex flex-col">
            {data.faqs.map((f) => (
              <FaqRow key={f.id} faq={f} onChanged={reload} />
            ))}
          </div>
        )}
        <Button variant="outline" onClick={addFaq} className="mt-3">
          <Plus /> Add FAQ
        </Button>
      </CardContent>
    </Card>
  );
}
