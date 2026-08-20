"use client";

import * as React from "react";
import { Kanban, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ChatFilterKey } from "@/lib/crm/chat-filters";
import { cn } from "@/lib/utils";
import { ContactDetail } from "./contact-detail";
import { ContactList } from "./contact-list";
import { CrmPipelineView } from "./crm-pipeline-view";
import { ExportContactsMenu } from "./export-contacts-menu";
import { ImportContactsDialog } from "./import-contacts-dialog";

type View = "list" | "pipeline";

export function CrmWorkspace({
  initialContactId,
  initialFilter,
}: {
  initialContactId: string | null;
  initialFilter?: ChatFilterKey;
}) {
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

  return (
    // Bleeds out of the app shell's p-4/md:p-6 with matching negative margins,
    // and drops the rounded Card entirely.
    //
    // Every other page in this app is a document that benefits from breathing
    // room. This one is a workspace, and the padding plus card chrome was
    // costing roughly 60px of vertical room and 48px of width on every screen —
    // which on a laptop is two or three chat rows and a visibly narrower
    // conversation, permanently, in exchange for a border nobody was reading.
    // 3.5rem is the app header's h-14, the only fixed chrome above this.
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background md:-m-6">
      {/* One slim strip instead of the old full-height toolbar row. The view
          toggle has to live here rather than inside the chat list, because it
          also switches the pipeline view on. */}
      <div
        className={cn(
          "shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5",
          view === "list" && selectedId ? "hidden md:flex" : "flex"
        )}
      >
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          <Button
            variant={view === "pipeline" ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-6 px-2 text-xs", view === "pipeline" && "shadow-sm")}
            onClick={() => setView("pipeline")}
          >
            <Kanban className="size-3.5" /> Pipeline
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-6 px-2 text-xs", view === "list" && "shadow-sm")}
            onClick={() => setView("list")}
          >
            <MessagesSquare className="size-3.5" /> Chats
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <ExportContactsMenu />
          <ImportContactsDialog onImported={onChanged} />
        </div>
      </div>

      {view === "pipeline" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <CrmPipelineView
            onSelect={(id) => {
              setSelectedId(id);
              setView("list");
            }}
            reloadToken={reloadToken}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              // No padding: the list draws its own header and flush rows, the
              // way a chat list does. Padding here reintroduced the "cards on
              // a dashboard" look this is meant to get away from.
              //
              // Wider than the old 24rem now that the page chrome is gone — the
              // status line and the mode chips both want the room, and the
              // conversation beside it loses nothing it was using.
              "w-full shrink-0 border-border md:w-[26rem] md:border-r",
              selectedId ? "hidden md:block" : "block"
            )}
          >
            <ContactList
              selectedId={selectedId}
              onSelect={setSelectedId}
              reloadToken={reloadToken}
              initialFilter={initialFilter}
            />
          </div>
          <div className={cn("min-w-0 flex-1", selectedId ? "flex" : "hidden md:flex")}>
            <ContactDetail contactId={selectedId} onChanged={onChanged} onBack={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
