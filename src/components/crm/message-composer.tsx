"use client";

import * as React from "react";
import { MessageSquareQuote, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useFetch } from "@/hooks/use-fetch";
import { classifyAttachment, describeLimit, exceedsLimit } from "@/lib/whatsapp/attachment";
import { Faq } from "@/types";

// One-tap short replies for the most common quick responses — separate
// from the FAQ-based quick replies below (which insert a hotel's own,
// often-longer FAQ answers). These stay short and end in an emoji on
// purpose, matching how a real person actually texts on WhatsApp.
const SHORT_REPLIES = [
  "Sure, checking now! 👍",
  "Thanks so much! 🙏",
  "Absolutely, yes! ✅",
  "One moment please 🙌",
  "Great choice! 🎉",
  "Sounds good! 👌",
  "You're welcome! 😊",
];

export function MessageComposer({
  onSend,
  onSendFile,
  sending,
  disabled,
  disabledReason,
}: {
  onSend: (text: string) => void;
  onSendFile?: (file: File, caption: string) => void;
  sending?: boolean;
  /**
   * Set when WhatsApp will not accept a free-form message (the 24-hour window
   * has closed). Previously the CRM only showed a banner ABOVE a fully live
   * composer, so staff kept sending into a closed window and the messages were
   * silently dropped by Meta. A warning that leaves the button working is not
   * a warning.
   */
  disabled?: boolean;
  disabledReason?: React.ReactNode;
}) {
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [quickReplyOpen, setQuickReplyOpen] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const { data } = useFetch<{ faqs: Faq[] }>(quickReplyOpen ? "/api/settings/faqs" : null);

  const previewUrl = React.useMemo(() => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function pickFile(picked: File | null) {
    setFileError(null);
    if (!picked) return;
    // Checked here as well as on the server so an oversized file fails
    // instantly instead of after a slow upload the send would reject anyway.
    const kind = classifyAttachment(picked.type || "application/octet-stream");
    if (exceedsLimit(kind, picked.size)) {
      setFileError(`That ${kind} is too large — WhatsApp's limit is ${describeLimit(kind)}.`);
      return;
    }
    setFile(picked);
  }

  function submit() {
    if (sending || disabled) return;
    const trimmed = text.trim();
    if (file && onSendFile) {
      onSendFile(file, trimmed);
      setFile(null);
      setText("");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  if (disabled) {
    return (
      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-500">
          {disabledReason}
        </div>
      </div>
    );
  }

  const canSend = Boolean(file) || Boolean(text.trim());

  return (
    <div className="flex flex-col gap-1.5 border-t border-border p-3">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {SHORT_REPLIES.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => onSend(reply)}
            disabled={sending}
            className="shrink-0 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium whitespace-nowrap hover:bg-muted disabled:opacity-50"
          >
            {reply}
          </button>
        ))}
      </div>

      {fileError && <p className="text-[11px] font-medium text-destructive">{fileError}</p>}

      {file && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={previewUrl} alt="" className="size-10 rounded object-cover" />
          ) : (
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{file.name}</p>
            <p className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => {
              setFile(null);
              if (fileInput.current) fileInput.current.value = "";
            }}
            aria-label="Remove attachment"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Popover open={quickReplyOpen} onOpenChange={setQuickReplyOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="icon" title="FAQ quick replies">
                <MessageSquareQuote />
              </Button>
            }
          />
          <PopoverContent align="start" side="top" className="w-80 p-0">
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-medium">📋 Your FAQ answers</p>
              <p className="text-[11px] text-muted-foreground">Tap to insert, then edit before sending.</p>
            </div>
            <ScrollArea className="max-h-64">
              {!data ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Loading…</p>
              ) : data.faqs.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">No FAQs yet — add some in Settings.</p>
              ) : (
                <div className="flex flex-col p-1">
                  {data.faqs.map((faq) => (
                    <button
                      key={faq.id}
                      onClick={() => {
                        setText(faq.answer);
                        setQuickReplyOpen(false);
                      }}
                      className="rounded-md p-2 text-left text-xs hover:bg-muted"
                    >
                      <p className="font-medium">{faq.question}</p>
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">{faq.answer}</p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="outline"
          size="icon"
          title="Attach a photo or file"
          aria-label="Attach a photo or file"
          onClick={() => fileInput.current?.click()}
          disabled={sending}
        >
          <Paperclip />
        </Button>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={file ? "Add a caption…" : "Type a message…"}
          className="max-h-32 min-h-9 flex-1 resize-none"
        />
        <Button size="icon" disabled={sending || !canSend} onClick={submit}>
          <Send />
        </Button>
      </div>
    </div>
  );
}
