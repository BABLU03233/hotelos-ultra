"use client";

import * as React from "react";
import { UserRoundPlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MetaTemplatePicker } from "@/components/templates/meta-template-picker";

interface ImportResponse {
  imported: number;
  skipped: number;
  errors: string[];
  corrected: string[];
  campaignId: string | null;
}

export function ImportContactsDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"file" | "manual">("file");
  const [file, setFile] = React.useState<File | null>(null);
  const [manualText, setManualText] = React.useState("");
  const [sendNow, setSendNow] = React.useState(false);
  const [metaTemplateId, setMetaTemplateId] = React.useState<string | null>(null);
  const [templateVariableValues, setTemplateVariableValues] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  function reset() {
    setFile(null);
    setManualText("");
    setSendNow(false);
    setMetaTemplateId(null);
    setTemplateVariableValues({});
  }

  async function submit() {
    setSubmitting(true);
    try {
      const form = new FormData();
      if (mode === "file" && file) form.set("file", file);
      if (mode === "manual" && manualText.trim()) form.set("manualText", manualText);
      if (sendNow && metaTemplateId) {
        form.set("metaTemplateId", metaTemplateId);
        if (Object.keys(templateVariableValues).length) form.set("templateVariableValues", JSON.stringify(templateVariableValues));
      }

      const res = await fetch("/api/contacts/import", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as ImportResponse | { error: string } | null;
      if (!res.ok) throw new Error((body as { error?: string })?.error || "Import failed");

      const result = body as ImportResponse;
      const parts = [`${result.imported} imported`];
      if (result.skipped) parts.push(`${result.skipped} already existed`);
      if (result.campaignId) parts.push(`${result.imported + result.skipped} messages queued`);
      toast.success(parts.join(" · "));
      if (result.corrected.length) {
        toast.info(
          `${result.corrected.length} number${result.corrected.length > 1 ? "s" : ""} had no country code — added +91 automatically: ${result.corrected.slice(0, 3).join("; ")}`
        );
      }
      if (result.errors.length) {
        toast.warning(`${result.errors.length} row${result.errors.length > 1 ? "s" : ""} skipped: ${result.errors.slice(0, 3).join("; ")}`);
      }

      setOpen(false);
      reset();
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    (mode === "file" ? !!file : manualText.trim().length > 0) && (!sendNow || !!metaTemplateId);

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || reset())}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <UserRoundPlus /> Import contacts
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import old numbers</DialogTitle>
          <DialogDescription>Bring in existing WhatsApp numbers to re-engage — from a spreadsheet or typed in by hand.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Tabs value={mode} onValueChange={(v) => v && setMode(v as "file" | "manual")}>
            <TabsList className="w-full">
              <TabsTrigger value="file">Upload file</TabsTrigger>
              <TabsTrigger value="manual">Enter manually</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="mt-3">
              <div className="flex flex-col gap-1.5">
                <Label>.csv, .xlsx, or .xls file</Label>
                <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">Needs a header row with a &quot;Phone&quot; column — a &quot;Name&quot; column is optional.</p>
              </div>
            </TabsContent>
            <TabsContent value="manual" className="mt-3">
              <div className="flex flex-col gap-1.5">
                <Label>One per line</Label>
                <Textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder={"Ananya, 9198765 43210\n9123456789"}
                  className="min-h-28"
                />
                <p className="text-xs text-muted-foreground">
                  &quot;Name, Phone&quot; or just a phone number, one per line. Missing the +91? We&apos;ll add it.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Send a re-engagement message now</p>
                <p className="text-xs text-muted-foreground">Uses an approved WhatsApp template — required for messaging numbers that haven&apos;t messaged you first.</p>
              </div>
              <Switch checked={sendNow} onCheckedChange={setSendNow} />
            </div>
            {sendNow && (
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
            )}
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
