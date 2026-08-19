"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { useAuthStore } from "@/store/use-auth-store";
import { Faq } from "@/types";

function FaqRow({ faq, onChanged }: { faq: Faq; onChanged: () => void }) {
  const [question, setQuestion] = React.useState(faq.question);
  const [answer, setAnswer] = React.useState(faq.answer);

  async function save() {
    if (question === faq.question && answer === faq.answer) return;
    const ok = await saveWithFeedback(
      () => apiFetch(`/api/settings/faqs/${faq.id}`, { method: "PATCH", body: JSON.stringify({ question, answer }) }),
      "Couldn’t save that FAQ"
    );
    if (ok) onChanged();
  }

  async function remove() {
    const ok = await saveWithFeedback(
      () => apiFetch(`/api/settings/faqs/${faq.id}`, { method: "DELETE" }),
      "Couldn’t delete that FAQ"
    );
    if (ok) onChanged();
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

function AddFaqDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch("/api/settings/faqs", {
        method: "POST",
        body: JSON.stringify({ question: question.trim(), answer: "" }),
      });
      setOpen(false);
      setQuestion("");
      onAdded();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="mt-3">
            <Plus /> Add FAQ
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a frequently asked question</DialogTitle>
          <DialogDescription>You&apos;ll fill in the answer right after.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label>Question</Label>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Do you have free parking?"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={submitting || !question.trim()}>
            {submitting ? "Adding…" : "Add FAQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FaqsSettings() {
  const { data, loading, reload } = useFetch<{ faqs: Faq[] }>("/api/settings/faqs");
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Frequently asked questions</CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <Skeleton className="h-32 w-full" />
        ) : data.faqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No FAQs yet — {agentName} escalates more often without them.</p>
        ) : (
          <div className="flex flex-col">
            {data.faqs.map((f) => (
              <FaqRow key={f.id} faq={f} onChanged={reload} />
            ))}
          </div>
        )}
        <AddFaqDialog onAdded={reload} />
      </CardContent>
    </Card>
  );
}
