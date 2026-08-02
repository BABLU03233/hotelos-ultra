"use client";

import { Bot, Check, CheckCheck, Clock, TriangleAlert, UserRound } from "lucide-react";
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

export function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "OUT";

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-snug",
          isOutbound ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted"
        )}
      >
        {message.type === "IMAGE" && message.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- remote WhatsApp/hotel-hosted URL, not a local asset
          <img src={message.mediaUrl} alt="" className="mb-1 max-h-64 w-full rounded-lg object-cover" />
        )}
        {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
        {!message.content && message.type !== "IMAGE" && (
          <p className="whitespace-pre-wrap">{`[${message.type.toLowerCase()}]`}</p>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {isOutbound && (message.senderUserId ? <UserRound className="size-2.5" /> : <Bot className="size-2.5" />)}
          <span>{formatDateTime(message.createdAt)}</span>
          {isOutbound && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}
