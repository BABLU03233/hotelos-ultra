"use client";

import * as React from "react";
import { Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/store/use-auth-store";
import { KnowledgeDocType } from "@/types";

const TYPE_LABELS: Record<KnowledgeDocType, string> = {
  TEXT: "Text",
  PDF: "PDF",
  BROCHURE: "Brochure (PDF)",
  IMAGE: "Image",
  FAQ: "FAQ document",
};

export function UploadKnowledgeDialog({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<KnowledgeDocType>("TEXT");
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  const needsFile = type !== "TEXT" && type !== "FAQ";

  async function submit() {
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("type", type);
      if (needsFile && file) form.set("file", file);
      if (!needsFile && text) form.set("text", text);

      const res = await fetch("/api/knowledge", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Upload failed");
      }

      setOpen(false);
      setTitle("");
      setText("");
      setFile(null);
      onUploaded();
      toast.success(`Added to ${agentName}'s knowledge base`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = title.trim() && (needsFile ? !!file : text.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus /> Add document
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to knowledge base</DialogTitle>
          <DialogDescription>{agentName} answers guest questions using only what&apos;s here.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hotel brochure 2026" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as KnowledgeDocType)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => TYPE_LABELS[v as KnowledgeDocType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsFile ? (
            <div className="flex flex-col gap-1.5">
              <Label>File</Label>
              <Input type="file" accept={type === "IMAGE" ? "image/*" : "application/pdf"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Content</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" placeholder={`Paste the text ${agentName} should know…`} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Uploading…" : "Add document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
