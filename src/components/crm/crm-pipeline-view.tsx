"use client";

import * as React from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatRelativeTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Contact, LeadStatus } from "@/types";

const STAGES: { key: LeadStatus; label: string; tone: string }[] = [
  { key: "NEW", label: "New", tone: "border-t-blue-500" },
  { key: "INTERESTED", label: "Interested", tone: "border-t-amber-500" },
  { key: "FOLLOW_UP", label: "Follow-up", tone: "border-t-violet-500" },
  { key: "BOOKED", label: "Booked", tone: "border-t-emerald-500" },
  { key: "CLOSED", label: "Closed", tone: "border-t-muted-foreground" },
];

function PipelineCard({ contact, onSelect }: { contact: Contact; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: contact.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const unread = !!contact.lastInboundAt && (!contact.lastReadAt || new Date(contact.lastInboundAt) > new Date(contact.lastReadAt));

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onSelect(contact.id)}
      className={cn(
        "flex w-full touch-none flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow-md",
        isDragging && "z-10 opacity-50"
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar className="size-6">
          <AvatarFallback className="text-[10px]">{initials(contact.name || contact.phone)}</AvatarFallback>
        </Avatar>
        <p className={cn("min-w-0 flex-1 truncate text-xs", unread ? "font-semibold" : "font-medium")}>
          {contact.name || contact.phone}
        </p>
        {unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
      </div>
      <p className="line-clamp-2 text-[11px] text-muted-foreground">{contact.lastMessage || "No messages yet"}</p>
      {contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contact.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground">{formatRelativeTime(contact.lastInboundAt || contact.updatedAt)}</span>
        {contact.assignedTo && (
          <Avatar className="size-4" title={contact.assignedTo.name}>
            <AvatarFallback className="text-[7px]">{initials(contact.assignedTo.name)}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </button>
  );
}

function PipelineColumn({
  stage,
  contacts,
  onSelect,
}: {
  stage: (typeof STAGES)[number];
  contacts: Contact[];
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });

  return (
    <div className="flex w-64 shrink-0 flex-col gap-2">
      <div className={cn("flex items-center justify-between border-t-2 pt-2", stage.tone)}>
        <p className="text-xs font-semibold">{stage.label}</p>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{contacts.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn("flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1 transition-colors", isOver && "bg-muted/60")}
      >
        {contacts.map((c) => (
          <PipelineCard key={c.id} contact={c} onSelect={onSelect} />
        ))}
        {contacts.length === 0 && <p className="p-4 text-center text-[10px] text-muted-foreground">No contacts</p>}
      </div>
    </div>
  );
}

export function CrmPipelineView({ onSelect, reloadToken }: { onSelect: (id: string) => void; reloadToken?: number }) {
  const { data, loading, reload } = useFetch<{ contacts: Contact[] }>("/api/contacts");

  React.useEffect(() => {
    if (reloadToken !== undefined) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const contactId = String(active.id);
    const newStatus = over.id as LeadStatus;
    const contact = data?.contacts.find((c) => c.id === contactId);
    if (!contact || contact.leadStatus === newStatus) return;
    await apiFetch(`/api/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify({ leadStatus: newStatus }) });
    reload();
  }

  if (loading || !data) {
    return (
      <div className="flex h-full gap-3 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-full w-64 shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-3">
        {STAGES.map((stage) => (
          <PipelineColumn
            key={stage.key}
            stage={stage}
            contacts={data.contacts.filter((c) => c.leadStatus === stage.key)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </DndContext>
  );
}
