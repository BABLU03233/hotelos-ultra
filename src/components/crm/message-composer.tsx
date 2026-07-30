"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageComposer({ onSend, sending }: { onSend: (text: string) => void; sending?: boolean }) {
  const [text, setText] = React.useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
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
