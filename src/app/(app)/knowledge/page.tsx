"use client";

import { FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadKnowledgeDialog } from "@/components/knowledge/upload-knowledge-dialog";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { KnowledgeDoc } from "@/types";

export default function KnowledgePage() {
  const { data, loading, reload } = useFetch<{ docs: KnowledgeDoc[] }>("/api/knowledge");

  async function remove(id: string) {
    await apiFetch(`/api/knowledge/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Knowledge base</h1>
          <p className="text-sm text-muted-foreground">Everything Aria can search through to answer guest questions.</p>
        </div>
        <UploadKnowledgeDialog onUploaded={reload} />
      </div>

      <div className="flex flex-col gap-3">
        {loading || !data
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
          : data.docs.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {doc.type === "IMAGE" ? <ImageIcon className="size-4.5" /> : <FileText className="size-4.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.type} · {doc._count?.chunks ?? 0} indexed chunks · {formatDate(doc.createdAt)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(doc.id)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
        {!loading && data?.docs.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing here yet — add your first document.</p>
        )}
      </div>
    </div>
  );
}
