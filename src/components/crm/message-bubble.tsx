"use client";

import { Bot, Check, CheckCheck, Clock, FileText, TriangleAlert, UserRound } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { Message } from "@/types";
import { cn } from "@/lib/utils";

function StatusTick({ status }: { status: Message["status"] }) {
  switch (status) {
    case "QUEUED":
      return <Clock className="size-2.5" />;
    case "SENT":
      return <Check className="size-3" />;
    case "DELIVERED":
      return <CheckCheck className="size-3" />;
    case "READ":
      return <CheckCheck className="size-3 text-blue-400" />;
    case "FAILED":
      return <TriangleAlert className="size-2.5 text-destructive" />;
    default:
      return null;
  }
}

/**
 * Turns Meta's error code into something a hotel receptionist can act on.
 *
 * The raw text Meta sends is written for developers ("Re-engagement message"),
 * and the code alone means nothing to staff. What matters is whether they did
 * something wrong, whether the guest will ever get it, and what to do instead
 * — so each case says that rather than restating the error.
 */
function explainFailure(code: number | null, title: string | null): string {
  switch (code) {
    case 131047:
      return "Not delivered — more than 24 hours have passed since this guest last messaged, so WhatsApp only allows an approved template. Ask them to message you first.";
    case 131026:
      return "Not delivered — this number isn't on WhatsApp, or can't receive messages from your business.";
    case 131051:
      return "Not delivered — this message type isn't supported for this recipient.";
    case 133010:
      return "Not delivered — your WhatsApp number isn't registered. Check Settings.";
    case 130472:
      return "Not delivered — this guest is in an experiment group that blocks marketing messages.";
    default:
      return title ? `Not delivered — ${title}` : "Not delivered. WhatsApp rejected this message.";
  }
}

function Attachment({ message }: { message: Message }) {
  // Always routed through our own endpoint: a raw Meta media URL needs an
  // Authorization header a browser can't attach, and when object storage is
  // configured the route just redirects to the public copy.
  const src = `/api/media/${message.id}`;
  const isImage = message.type === "IMAGE" || (message.mediaMimeType?.startsWith("image/") ?? false);

  if (isImage) {
    return (
      <a href={src} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- streamed through our own media route, not a local asset */}
        <img src={src} alt={message.mediaFilename ?? "Attachment"} className="mb-1 max-h-64 w-full rounded-lg object-cover" />
      </a>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2 hover:bg-black/20"
    >
      <FileText className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{message.mediaFilename ?? "Attachment"}</span>
    </a>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "OUT";
  const failed = message.status === "FAILED";
  const hasAttachment = Boolean(message.mediaId || message.mediaUrl);

  return (
    <div className={cn("flex flex-col", isOutbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-snug",
          isOutbound ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted",
          // A failed message must not look like a delivered one. The status
          // icon alone was 10px of red in the corner of an otherwise normal
          // bubble, which staff read as "sent".
          failed && "bg-destructive/10 text-foreground ring-1 ring-destructive/40"
        )}
      >
        {hasAttachment && <Attachment message={message} />}
        {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
        {!message.content && !hasAttachment && (
          <p className="whitespace-pre-wrap opacity-70">{`[${message.type.toLowerCase()}]`}</p>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            isOutbound && !failed ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {isOutbound && (message.senderUserId ? <UserRound className="size-2.5" /> : <Bot className="size-2.5" />)}
          <span>{formatDateTime(message.createdAt)}</span>
          {isOutbound && <StatusTick status={message.status} />}
        </div>
      </div>

      {failed && (
        <p className="mt-1 max-w-[75%] text-right text-[11px] font-medium text-destructive">
          {explainFailure(message.errorCode, message.errorTitle)}
        </p>
      )}
    </div>
  );
}
