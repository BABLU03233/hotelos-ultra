"use client";

import * as React from "react";
import { Bot, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { conversationMode } from "@/lib/crm/handover";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { cn } from "@/lib/utils";
import { Contact } from "@/types";

/**
 * Who is answering this guest, and the one control that changes it.
 *
 * This replaces a "Pause AI" / "Resume AI" pair. Those were phrased around the
 * software's state rather than the receptionist's job — nobody at a front desk
 * thinks "I would like to pause the AI", they think "I'll take this one" or
 * "I'm done, let the bot carry on". The labels now say that, and the state is
 * stated in a full-width line rather than a chip, because who is replying is
 * the single most consequential thing on this screen: get it wrong and either
 * the guest is answered twice or not at all.
 */
export function HandoverControls({
  contact,
  agentName,
  onChanged,
}: {
  contact: Contact;
  agentName: string;
  onChanged: () => void;
}) {
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [briefing, setBriefing] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const mode = conversationMode(contact);

  async function post(body: Record<string, unknown>, success: string) {
    setBusy(true);
    const ok = await saveWithFeedback(
      () => apiFetch(`/api/contacts/${contact.id}/handover`, { method: "POST", body: JSON.stringify(body) }),
      "Couldn't change who's handling this chat"
    );
    setBusy(false);
    if (ok) {
      toast.success(success);
      setReturnOpen(false);
      setBriefing("");
      onChanged();
    }
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2.5 py-1.5 text-xs",
          mode === "human"
            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
            : mode === "paused"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-primary/10 text-primary"
        )}
      >
        {mode === "ai" ? <Bot className="size-3.5 shrink-0" /> : <UserRound className="size-3.5 shrink-0" />}

        <span className="min-w-0 flex-1 font-medium">
          {mode === "human" ? (
            <>
              You&apos;re handling this chat
              {contact.handoverByName ? ` — ${contact.handoverByName} took it` : ""}
              {contact.handoverReason ? ` · ${contact.handoverReason}` : ""}.{" "}
              <span className="font-normal opacity-80">{agentName} won&apos;t reply until you hand it back.</span>
            </>
          ) : mode === "paused" ? (
            <>
              {agentName} is paused here.{" "}
              {/* Says when it ends. The old badge just said "AI paused", which
                  gave staff no way to know whether the guest was about to be
                  answered or had been abandoned. */}
              <span className="font-normal opacity-80">She&apos;ll pick it back up within 12 hours.</span>
            </>
          ) : (
            <>
              {agentName} is replying to this guest.{" "}
              <span className="font-normal opacity-80">Take over if you want to handle it yourself.</span>
            </>
          )}
        </span>

        {mode === "human" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setReturnOpen(true)}>
            Return to {agentName}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => post({ action: "take_over" }, "You're handling this chat now.")}
          >
            I&apos;ll take this
          </Button>
        )}
      </div>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hand this chat back to {agentName}</DialogTitle>
            <DialogDescription>
              Anything she should know? She&apos;ll treat this as fact and won&apos;t ask the guest about it again.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            rows={3}
            placeholder="e.g. Quoted ₹2,400 for the Deluxe on the phone. Guest is checking with family and will confirm by Friday."
          />
          <p className="text-[11px] text-muted-foreground">
            Optional — leave it empty if there&apos;s nothing to pass on. This replaces any earlier note.
          </p>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturnOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                post(
                  { action: "return_to_ai", briefing: briefing.trim() || undefined },
                  `${agentName} is handling this chat again.`
                )
              }
            >
              Hand back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
