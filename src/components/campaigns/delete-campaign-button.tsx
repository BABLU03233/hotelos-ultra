"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";

/**
 * Removes a campaign that never sent — the other half of "edit or remove"
 * once a broadcast is sitting in review: until now a duplicate made by
 * mistake, or a submission the owner changed their mind about, had no way
 * off the list except waiting for a reviewer to reject it.
 *
 * Not offered once sentAt is set — the server refuses that too (see
 * DELETE /api/campaigns/[id]) — a sent campaign's recipient rows are the
 * delivery record of what actually happened.
 */
export function DeleteCampaignButton({
  campaignId,
  campaignName,
  onDeleted,
}: {
  campaignId: string;
  campaignName: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await apiFetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      toast.success(`Removed "${campaignName}"`);
      setOpen(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t remove that campaign");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Remove ${campaignName}`}
            // Stops the click reaching an ancestor <Link> (the campaigns list
            // wraps each row in one) — without this, removing a campaign
            // also navigated to its now-deleted detail page.
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Remove &quot;{campaignName}&quot;?</DialogTitle>
          <DialogDescription>
            It hasn&apos;t sent anything, so nothing goes out to guests — this just deletes the campaign and its
            recipient list. There&apos;s no undo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={deleting} onClick={remove}>
            {deleting ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
