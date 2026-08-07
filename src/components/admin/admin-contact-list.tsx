"use client";

import * as React from "react";
import { MessageSquareText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageBubble } from "@/components/crm/message-bubble";
import { useFetch } from "@/hooks/use-fetch";
import { formatRelativeTime } from "@/lib/format";
import { LEAD_STATUS_HEX } from "@/lib/lead-status-colors";
import { Contact, LeadStatus, Message } from "@/types";

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-up",
  BOOKED: "Booked",
  CLOSED: "Closed",
};

type AdminContact = Pick<Contact, "id" | "name" | "phone" | "whatsappNumber" | "leadStatus" | "lastMessage" | "lastInboundAt">;

export function AdminContactList({ tenantId }: { tenantId: string }) {
  const { data, loading } = useFetch<{ contacts: AdminContact[] }>(`/api/admin/tenants/${tenantId}/contacts`);
  const [openContactId, setOpenContactId] = React.useState<string | null>(null);

  if (loading || !data) return <Skeleton className="h-40 w-full" />;

  if (data.contacts.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">No guests yet for this hotel.</p>;
  }

  return (
    <div className="flex flex-col">
      {data.contacts.map((c) => (
        <button
          key={c.id}
          onClick={() => setOpenContactId(c.id)}
          className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-left last:border-0 hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: LEAD_STATUS_HEX[c.leadStatus] }}
              />
              <p className="truncate text-sm font-medium">{c.name || c.phone}</p>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {c.whatsappNumber} · {c.lastMessage || "No messages yet"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-medium text-muted-foreground">{LEAD_STATUS_LABELS[c.leadStatus]}</p>
            {c.lastInboundAt && <p className="text-[10px] text-muted-foreground">{formatRelativeTime(c.lastInboundAt)}</p>}
          </div>
        </button>
      ))}

      <Dialog open={!!openContactId} onOpenChange={(o) => !o && setOpenContactId(null)}>
        <DialogContent className="flex max-h-[80vh] max-w-lg flex-col">
          {openContactId && <TranscriptDialogBody tenantId={tenantId} contactId={openContactId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TranscriptDialogBody({ tenantId, contactId }: { tenantId: string; contactId: string }) {
  const { data, loading } = useFetch<{ contact: Contact; messages: Message[] }>(
    `/api/admin/tenants/${tenantId}/contacts/${contactId}/messages`
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1.5">
          <MessageSquareText className="size-4 shrink-0" />
          {data ? data.contact.name || data.contact.phone : "Conversation"}
        </DialogTitle>
        <DialogDescription>{data?.contact.whatsappNumber}</DialogDescription>
      </DialogHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2.5 p-1">
          {loading || !data
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)
            : data.messages.length === 0
              ? <p className="py-6 text-center text-xs text-muted-foreground">No messages yet.</p>
              : data.messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        </div>
      </ScrollArea>
    </>
  );
}
