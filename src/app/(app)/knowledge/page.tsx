"use client";

import { BookOpen, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadKnowledgeDialog } from "@/components/knowledge/upload-knowledge-dialog";
import { Reveal } from "@/components/motion/reveal";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { StaggerItem } from "@/components/motion/stagger-item";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useAuthStore } from "@/store/use-auth-store";
import { KnowledgeDoc, KnowledgeDocType } from "@/types";

const TYPE_LABELS: Record<KnowledgeDocType, string> = {
  TEXT: "Pasted text",
  PDF: "PDF document",
  IMAGE: "Image",
  BROCHURE: "Brochure",
  FAQ: "FAQ list",
};

export default function KnowledgePage() {
  const { data, loading, reload } = useFetch<{ docs: KnowledgeDoc[] }>("/api/knowledge");
  const agentName = useAuthStore((s) => s.tenant?.aiAgentName ?? "Anushka");

  async function remove(id: string) {
    await apiFetch(`/api/knowledge/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Knowledge base</h1>
            <p className="mt-1 text-sm text-muted-foreground">Everything {agentName} can search through to answer guest questions.</p>
          </div>
          <UploadKnowledgeDialog onUploaded={reload} />
        </div>
      </Reveal>

      <div className="flex flex-col gap-3">
        <SkeletonSwap
          showSkeleton={loading || !data}
          skeleton={
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {data?.docs.map((doc, i) => (
              <StaggerItem key={doc.id} index={i}>
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {doc.type === "IMAGE" ? <ImageIcon className="size-4.5" /> : <FileText className="size-4.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[doc.type]} · added {formatDate(doc.createdAt)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(doc.id)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </div>
        </SkeletonSwap>
        {!loading && data?.docs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <BookOpen className="size-8" />
            <p className="text-sm font-medium text-foreground">{agentName}&apos;s knowledge base is empty</p>
            <p className="max-w-xs text-xs">Upload a PDF, brochure, or paste in text/FAQs — an empty knowledge base means {agentName} escalates almost everything.</p>
          </div>
        )}
      </div>
    </div>
  );
}
