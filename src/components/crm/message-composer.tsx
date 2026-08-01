"use client";

import * as React from "react";
import { MessageSquareQuote, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useFetch } from "@/hooks/use-fetch";
import { Faq } from "@/types";

export function MessageComposer({ onSend, sending }: { onSend: (text: string) => void; sending?: boolean }) {
  const [text, setText] = React.useState("");
  const [quickReplyOpen, setQuickReplyOpen] = React.useState(false);
  const { data } = useFetch<{ faqs: Faq[] }>(quickReplyOpen ? "/api/settings/faqs" : null);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <Popover open={quickReplyOpen} onOpenChange={setQuickReplyOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="icon" title="Quick replies">
              <MessageSquareQuote />
            </Button>
          }
        />
        <PopoverContent align="start" side="top" className="w-80 p-0">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-medium">Quick replies</p>
            <p className="text-[11px] text-muted-foreground">From your FAQ list — insert, then edit before sending.</p>
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
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Type a message…"
        className="max-h-32 min-h-9 flex-1 resize-none"
      />
      <Button size="icon" disabled={sending || !text.trim()} onClick={submit}>
        <Send />
      </Button>
    </div>
  );
}
