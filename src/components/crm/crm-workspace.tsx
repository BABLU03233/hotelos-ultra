"use client";

import * as React from "react";
import { Kanban, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ContactDetail } from "./contact-detail";
import { ContactList } from "./contact-list";
import { CrmPipelineView } from "./crm-pipeline-view";

type View = "list" | "pipeline";

export function CrmWorkspace({ initialContactId }: { initialContactId: string | null }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(initialContactId);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [view, setView] = React.useState<View>(initialContactId ? "list" : "pipeline");

  function onChanged() {
    setReloadToken((t) => t + 1);
  }

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] flex-col gap-3">
      <div className="flex items-center gap-1 self-start rounded-lg border border-border bg-card p-1">
        <Button
          variant={view === "pipeline" ? "secondary" : "ghost"}
          size="sm"
          className={cn("h-7 px-2.5 text-xs", view === "pipeline" && "shadow-sm")}
          onClick={() => setView("pipeline")}
        >
          <Kanban className="size-3.5" /> Pipeline
        </Button>
        <Button
          variant={view === "list" ? "secondary" : "ghost"}
          size="sm"
          className={cn("h-7 px-2.5 text-xs", view === "list" && "shadow-sm")}
          onClick={() => setView("list")}
        >
          <List className="size-3.5" /> List
        </Button>
      </div>

      {view === "pipeline" ? (
        <Card className="min-h-0 flex-1 overflow-hidden p-0">
          <CrmPipelineView
            onSelect={(id) => {
              setSelectedId(id);
              setView("list");
            }}
            reloadToken={reloadToken}
          />
        </Card>
      ) : (
        <Card className="min-h-0 flex-1 flex-row overflow-hidden p-0">
          <div className="w-80 shrink-0 border-r border-border py-3 pl-3 pr-1">
            <ContactList selectedId={selectedId} onSelect={setSelectedId} reloadToken={reloadToken} />
          </div>
          <ContactDetail contactId={selectedId} onChanged={onChanged} />
        </Card>
      )}
    </div>
  );
}
