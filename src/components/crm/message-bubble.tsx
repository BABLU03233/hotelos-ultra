"use client";

import { Bot, Check, CheckCheck, Clock, FileText, TriangleAlert, UserRound } from "lucide-react";
import { formatClockTime } from "@/lib/format";
import { Message } from "@/types";
import { cn } from "@/lib/utils";

function StatusTick({ status }: { status: Message["status"] }) {
  switch (status) {
    case "QUEUED":
      return <Clock className="size-3 text-black/40 dark:text-white/40" />;
    case "SENT":
      return <Check className="size-3.5 text-black/40 dark:text-white/45" />;
    case "DELIVERED":
      return <CheckCheck className="size-3.5 text-black/40 dark:text-white/45" />;
    case "READ":
      // WhatsApp's blue double tick — the one signal staff actually look for.
      return <CheckCheck className="size-3.5 text-[#53bdeb]" />;
    case "FAILED":
      return <TriangleAlert className="size-3 text-destructive" />;
    default:
      return null;
  }
}

/**
 * Turns Meta's error code into something a hotel receptionist can act on.
 *
 * The raw text Meta sends is written for developers ("Re-engagement message"),
 * and the code alone means nothing to staff. What matters is whether the guest
 * will ever get it and what to do instead, so each case says that rather than
 * restating the error.
 *
 * This is the whole reason the composer no longer pre-emptively warns about
 * the 24-hour window: staff can always try, and if WhatsApp refuses, the
 * message itself explains why.
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

function Attachment({ message, isOutbound }: { message: Message; isOutbound: boolean }) {
  // Always routed through our own endpoint: a raw Meta media URL needs an
  // Authorization header a browser can't attach, and when object storage is
  // configured the route just redirects to the public copy.
  const src = `/api/media/${message.id}`;
  const isImage = message.type === "IMAGE" || (message.mediaMimeType?.startsWith("image/") ?? false);

  if (isImage) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- streamed through our own media route, not a local asset */}
        <img
          src={src}
          alt={message.mediaFilename ?? "Attachment"}
          className="-mx-1 -mt-0.5 mb-1 max-h-72 w-[calc(100%+0.5rem)] rounded-md object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mb-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors",
        isOutbound ? "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15" : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
      )}
    >
      <FileText className="size-5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{message.mediaFilename ?? "Attachment"}</span>
    </a>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "OUT";
  const failed = message.status === "FAILED";
  const hasAttachment = Boolean(message.mediaId || message.mediaUrl);

  return (
    <div className={cn("flex flex-col px-1", isOutbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "relative max-w-[78%] min-w-[6rem] px-2 py-1.5 text-[14.2px] leading-[19px] shadow-sm",
          // WhatsApp's own bubble geometry: 7.5px radius, square corner on the
          // side the tail sits.
          "rounded-[7.5px]",
          isOutbound
            ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
            : "rounded-tl-none bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]",
          failed && "ring-1 ring-destructive/50"
        )}
      >
        {/* The tail. A CSS triangle rather than an SVG asset — it has to pick
            up the same background colour in both themes. */}
        <span
          aria-hidden
          className={cn(
            "absolute top-0 size-0 border-y-[8px] border-y-transparent",
            isOutbound
              ? "-right-[8px] border-l-[8px] border-l-[#d9fdd3] dark:border-l-[#005c4b]"
              : "-left-[8px] border-r-[8px] border-r-white dark:border-r-[#202c33]"
          )}
        />

        {hasAttachment && <Attachment message={message} isOutbound={isOutbound} />}

        {message.content && (
          // The right padding reserves room for the timestamp, which WhatsApp
          // floats into the last line rather than putting on its own row.
          <p className="whitespace-pre-wrap break-words pr-[62px]">{message.content}</p>
        )}
        {!message.content && !hasAttachment && (
          <p className="pr-[62px] whitespace-pre-wrap opacity-60">{`[${message.type.toLowerCase()}]`}</p>
        )}

        <span className="float-right -mt-3 ml-1 flex translate-y-[3px] items-center gap-1 text-[11px] text-black/45 select-none dark:text-white/50">
          {isOutbound && (message.senderUserId ? <UserRound className="size-2.5" /> : <Bot className="size-2.5" />)}
          {formatClockTime(message.createdAt)}
          {isOutbound && <StatusTick status={message.status} />}
        </span>
      </div>

      {failed && (
        <p className="mt-1 max-w-[78%] text-right text-[11px] font-medium text-destructive">
          {explainFailure(message.errorCode, message.errorTitle)}
        </p>
      )}
    </div>
  );
}
