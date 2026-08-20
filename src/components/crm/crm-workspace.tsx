"use client";

import * as React from "react";
import { Kanban, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ContactDetail } from "./contact-detail";
import { ContactList } from "./contact-list";
import { CrmPipelineView } from "./crm-pipeline-view";
import { ExportContactsMenu } from "./export-contacts-menu";
import { ImportContactsDialog } from "./import-contacts-dialog";

type View = "list" | "pipeline";

export function CrmWorkspace({ initialContactId }: { initialContactId: string | null }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(initialContactId);
  const [reloadToken, setReloadToken] = React.useState(0);
  // Chat-first landing, matching the reference this was built against:
  // opening the CRM shows the WhatsApp-style desk immediately, the same way
  // opening WhatsApp Web itself lands you in the conversation list, not a
  // board. Pipeline is one click away for the funnel view, not the default.
  const [view, setView] = React.useState<View>("list");

  function onChanged() {
    setReloadToken((t) => t + 1);
  }

  // Taller than before: the page heading above shrank from three lines to one,
  // so the desk reclaims that space instead of leaving a gap below the chat.
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col gap-2.5">
      <div className={cn("items-center justify-between gap-2", view === "list" && selectedId ? "hidden md:flex" : "flex")}>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
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
            <MessagesSquare className="size-3.5" /> Chats
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ExportContactsMenu />
          <ImportContactsDialog onImported={onChanged} />
        </div>
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
          <div
            className={cn(
              // No padding: the list draws its own header and flush rows, the
              // way a chat list does. Padding here reintroduced the "cards on
              // a dashboard" look this is meant to get away from.
              "w-full shrink-0 border-border md:w-[24rem] md:border-r",
              selectedId ? "hidden md:block" : "block"
            )}
          >
            <ContactList selectedId={selectedId} onSelect={setSelectedId} reloadToken={reloadToken} />
          </div>
          <div className={cn("min-w-0 flex-1", selectedId ? "flex" : "hidden md:flex")}>
            <ContactDetail contactId={selectedId} onChanged={onChanged} onBack={() => setSelectedId(null)} />
          </div>
        </Card>
      )}
    </div>
  );
}
