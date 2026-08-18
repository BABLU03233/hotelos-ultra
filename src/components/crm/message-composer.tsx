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
}: {
  onSend: (text: string) => void;
  onSendFile?: (file: File, caption: string) => void;
  sending?: boolean;
}) {
  // No 24-hour-window warning here by design.
  //
  // It went through three versions: a banner beside a live composer, then a
  // hard block, then a soft warning — and all three put a caveat in front of
  // staff every time they opened an older conversation. Meta owns that clock
  // anyway, ours can disagree with it at the boundary, and a guest may have
  // reopened the window from another device we never saw. So the composer
  // simply always works.
  //
  // Honesty is preserved where it costs nothing: if WhatsApp does refuse a
  // message, the bubble itself says why (see explainFailure in
  // message-bubble.tsx). Report the real outcome, don't predict it.
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
    if (sending) return;
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

  const canSend = Boolean(file) || Boolean(text.trim());

  return (
    <div className="flex flex-col gap-1.5 bg-[#f0f2f5] p-2.5 dark:bg-[#202c33]">
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

      {/* WhatsApp's composer row: icons sit flat next to a single rounded
          input, with only the send button carrying colour. */}
      <div className="flex items-end gap-1.5">
        <Popover open={quickReplyOpen} onOpenChange={setQuickReplyOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                title="FAQ quick replies"
                className="size-10 shrink-0 rounded-full text-[#54656f] hover:bg-black/5 dark:text-[#aebac1] dark:hover:bg-white/10"
              >
                <MessageSquareQuote className="size-5" />
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
          variant="ghost"
          size="icon"
          title="Attach a photo or file"
          aria-label="Attach a photo or file"
          onClick={() => fileInput.current?.click()}
          disabled={sending}
          className="size-10 shrink-0 rounded-full text-[#54656f] hover:bg-black/5 dark:text-[#aebac1] dark:hover:bg-white/10"
        >
          <Paperclip className="size-5" />
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
          placeholder={file ? "Add a caption…" : "Type a message"}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-[21px] border-0 bg-white px-4 py-[11px] text-[15px] shadow-none focus-visible:ring-0 dark:bg-[#2a3942]"
        />
        <Button
          size="icon"
          disabled={sending || !canSend}
          onClick={submit}
          aria-label="Send"
          className="size-10 shrink-0 rounded-full bg-[#00a884] text-white hover:bg-[#06cf9c] disabled:opacity-40 dark:bg-[#00a884]"
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}
