"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const MESSAGES = [
  { from: "guest", text: "Hi! Do you have a room free this weekend for 2 guests?" },
  {
    from: "aria",
    text: "Yes! Our Deluxe Room is available Fri–Sun — ₹4,500/night, breakfast included. Want me to hold it for you?",
  },
  { from: "guest", text: "Yes please, and can I get a late checkout?" },
  { from: "aria", text: "Done ✅ Booked, and I've noted your late-checkout request — our team will confirm shortly." },
] as const;

export function ChatMockup() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="glass-strong w-full max-w-sm overflow-hidden rounded-3xl">
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-primary/10 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Anushka · Hotel Ivory Towers</p>
          <p className="text-[11px] text-muted-foreground">Online · replies in seconds</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {MESSAGES.map((m, i) => (
          <motion.div
            key={i}
            initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
              m.from === "aria"
                ? "self-end rounded-br-sm bg-[#dcf8c6] text-[#111b21] dark:bg-[#025144] dark:text-[#e9edef]"
                : "self-start rounded-bl-sm bg-muted text-foreground"
            )}
          >
            {m.text}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
