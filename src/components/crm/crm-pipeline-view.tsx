"use client";

import * as React from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SkeletonSwap } from "@/components/motion/skeleton-swap";
import { StaggerItem } from "@/components/motion/stagger-item";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatRelativeTime, initials } from "@/lib/format";
import {
  LEAD_STATUS_BG,
  LEAD_STATUS_BORDER,
  LEAD_STATUS_DESCRIPTION,
  LEAD_STATUS_DOT,
  LEAD_STATUS_HEX,
  LEAD_STATUS_LEFT_BORDER,
} from "@/lib/lead-status-colors";
import { cn } from "@/lib/utils";
import { Contact, LeadStatus } from "@/types";

const STAGES: { key: LeadStatus; label: string; topBorder: string; leftBorder: string; bg: string; dot: string; hex: string }[] = [
  { key: "NEW", label: "New", topBorder: LEAD_STATUS_BORDER.NEW, leftBorder: LEAD_STATUS_LEFT_BORDER.NEW, bg: LEAD_STATUS_BG.NEW, dot: LEAD_STATUS_DOT.NEW, hex: LEAD_STATUS_HEX.NEW },
  { key: "INTERESTED", label: "Interested", topBorder: LEAD_STATUS_BORDER.INTERESTED, leftBorder: LEAD_STATUS_LEFT_BORDER.INTERESTED, bg: LEAD_STATUS_BG.INTERESTED, dot: LEAD_STATUS_DOT.INTERESTED, hex: LEAD_STATUS_HEX.INTERESTED },
  { key: "FOLLOW_UP", label: "Follow-up", topBorder: LEAD_STATUS_BORDER.FOLLOW_UP, leftBorder: LEAD_STATUS_LEFT_BORDER.FOLLOW_UP, bg: LEAD_STATUS_BG.FOLLOW_UP, dot: LEAD_STATUS_DOT.FOLLOW_UP, hex: LEAD_STATUS_HEX.FOLLOW_UP },
  { key: "BOOKED", label: "Booked", topBorder: LEAD_STATUS_BORDER.BOOKED, leftBorder: LEAD_STATUS_LEFT_BORDER.BOOKED, bg: LEAD_STATUS_BG.BOOKED, dot: LEAD_STATUS_DOT.BOOKED, hex: LEAD_STATUS_HEX.BOOKED },
  { key: "CLOSED", label: "Closed", topBorder: LEAD_STATUS_BORDER.CLOSED, leftBorder: LEAD_STATUS_LEFT_BORDER.CLOSED, bg: LEAD_STATUS_BG.CLOSED, dot: LEAD_STATUS_DOT.CLOSED, hex: LEAD_STATUS_HEX.CLOSED },
];

function PipelineCard({
  contact,
  onSelect,
  borderTone,
}: {
  contact: Contact;
  onSelect: (id: string) => void;
  borderTone: string;
}) {
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
        "flex w-full touch-none flex-col gap-1.5 rounded-lg border-l-[3px] border-y border-r border-border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow-md",
        borderTone,
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
      <div className={cn("flex items-center justify-between border-t-2 pt-2", stage.topBorder)}>
        <Tooltip>
          <TooltipTrigger
            render={
              <p className="flex cursor-help items-center gap-1.5 text-xs font-semibold">
                <span className={cn("size-1.5 shrink-0 rounded-full", stage.dot)} />
                {stage.label}
              </p>
            }
          />
          <TooltipContent>{LEAD_STATUS_DESCRIPTION[stage.key]}</TooltipContent>
        </Tooltip>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", stage.bg)} style={{ color: stage.hex }}>
          {contacts.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn("flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1 transition-colors", isOver && stage.bg)}
      >
        {contacts.map((c, i) => (
          <StaggerItem key={c.id} index={i}>
            <PipelineCard contact={c} onSelect={onSelect} borderTone={stage.leftBorder} />
          </StaggerItem>
        ))}
        {contacts.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
            <Inbox className="size-5 text-muted-foreground opacity-30" />
            <p className="text-[10px] text-muted-foreground">No contacts</p>
          </div>
        )}
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

  return (
    <SkeletonSwap
      showSkeleton={loading || !data}
      className="h-full"
      skeleton={
        <div className="flex h-full gap-3 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-full w-64 shrink-0" />
          ))}
        </div>
      }
    >
      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex h-full gap-3 overflow-x-auto p-3">
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage.key}
              stage={stage}
              contacts={data?.contacts.filter((c) => c.leadStatus === stage.key) ?? []}
              onSelect={onSelect}
            />
          ))}
        </div>
      </DndContext>
    </SkeletonSwap>
  );
}
