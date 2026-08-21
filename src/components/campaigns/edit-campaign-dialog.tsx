"use client";

import * as React from "react";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MetaTemplatePicker } from "@/components/templates/meta-template-picker";
import { TemplatePicker } from "@/components/templates/template-picker";
import { CopyCheck } from "@/components/campaigns/copy-check";
import { CampaignImageUpload } from "@/components/campaigns/image-upload";
import { apiFetch } from "@/lib/api-client";
import { Campaign, CampaignMessageType } from "@/types";

const MESSAGE_TYPE_LABELS: Record<CampaignMessageType, string> = {
  TEXT: "Text",
  IMAGE: "Image",
  TEMPLATE: "Approved template",
};

/**
 * Edit a campaign that has not gone out, and put it back in the queue.
 *
 * This is the other half of "send back for changes". Without it the reviewer
 * could ask for a change and the owner had nowhere to make it: the campaign
 * screen said "Needs a change" and offered only a Send button that the server
 * would refuse. The API had accepted content edits for a while; nothing on
 * screen called it.
 *
 * Deliberately not offered on an APPROVED campaign — that copy was reviewed
 * as written, and editing it afterwards would put text in front of guests
 * that nobody approved. The server refuses that too; this just doesn't
 * pretend otherwise.
 */
export function EditCampaignDialog({ campaign, onSaved }: { campaign: Campaign; onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(campaign.name);
  const [messageType, setMessageType] = React.useState<CampaignMessageType>(campaign.messageType);
  const [body, setBody] = React.useState(campaign.body ?? "");
  const [mediaUrl, setMediaUrl] = React.useState(campaign.mediaUrl ?? "");
  const [metaTemplateId, setMetaTemplateId] = React.useState<string | null>(campaign.metaTemplateId);
  const [templateVariableValues, setTemplateVariableValues] = React.useState<Record<string, string>>(
    campaign.templateVariableValues ?? {}
  );
  const [saving, setSaving] = React.useState(false);

  /**
   * Reset the fields to whatever the campaign currently says whenever the
   * dialog is opened, rather than in an effect. Reopening after a save must
   * not show the values from before that save, and reopening after a cancel
   * must not keep the edits that were abandoned.
   */
  function openChange(next: boolean) {
    if (next) {
      setName(campaign.name);
      setMessageType(campaign.messageType);
      setBody(campaign.body ?? "");
      setMediaUrl(campaign.mediaUrl ?? "");
      setMetaTemplateId(campaign.metaTemplateId);
      setTemplateVariableValues(campaign.templateVariableValues ?? {});
    }
    setOpen(next);
  }

  /** What is missing, in words — never a silently disabled button. */
  const issue = !name.trim()
    ? "Give this broadcast a name."
    : messageType === "TEMPLATE"
      ? metaTemplateId
        ? null
        : "Choose an approved template."
      : messageType === "IMAGE"
        ? mediaUrl
          ? null
          : "Add the image you want to send."
        : body.trim()
          ? null
          : "Write the message you want to send.";

  async function save(resubmit: boolean) {
    setSaving(true);
    try {
      await apiFetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          messageType,
          body: body.trim() ? body : null,
          mediaUrl: messageType === "IMAGE" ? mediaUrl : null,
          metaTemplateId: messageType === "TEMPLATE" ? metaTemplateId : null,
          templateVariableValues:
            messageType === "TEMPLATE" && Object.keys(templateVariableValues).length ? templateVariableValues : null,
          resubmit,
        }),
      });
      setOpen(false);
      toast.success(
        resubmit
          ? "Sent back for approval — we'll review the change and let you know."
          : "Saved. Submit it for approval when you're ready."
      );
      onSaved();
    } catch (err) {
      // Kept open on failure, so a rewritten message is not lost to a
      // rejected save.
      toast.error(err instanceof Error ? err.message : "Couldn’t save that change");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <PenLine className="size-4" /> Edit
          </Button>
        }
      />
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 p-4 pb-3">
          <DialogTitle>Edit broadcast</DialogTitle>
          <DialogDescription>
            {campaign.reviewNote
              ? `Asked for: “${campaign.reviewNote}”`
              : "Change the message, then submit it for approval again."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Just so you can find it later — guests never see this.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Message type</Label>
              <Select value={messageType} onValueChange={(v) => v && setMessageType(v as CampaignMessageType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => MESSAGE_TYPE_LABELS[v as CampaignMessageType]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {messageType === "TEMPLATE" ? (
              <div className="flex flex-col gap-1.5">
                <Label>Meta-approved template</Label>
                <MetaTemplatePicker
                  metaTemplateId={metaTemplateId}
                  templateVariableValues={templateVariableValues}
                  onChange={(next) => {
                    setMetaTemplateId(next.metaTemplateId);
                    setTemplateVariableValues(next.templateVariableValues);
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>{messageType === "IMAGE" ? "Caption (optional)" : "Message"}</Label>
                  <TemplatePicker onInsert={setBody} bulkOnly />
                </div>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-24" />
                <CopyCheck body={body} />
              </div>
            )}

            {messageType === "IMAGE" && <CampaignImageUpload value={mediaUrl} onChange={setMediaUrl} />}

            <p className="text-[11px] text-muted-foreground">
              Recipients and timing aren&apos;t changed here — they stay as you set them.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/60 p-3">
          {issue && <p className="mb-2 px-1 text-[11px] text-muted-foreground">{issue}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" disabled={!!issue || saving} onClick={() => save(false)}>
              Save only
            </Button>
            <Button size="sm" disabled={!!issue || saving} onClick={() => save(true)}>
              {saving ? "Saving…" : "Save & submit for approval"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
