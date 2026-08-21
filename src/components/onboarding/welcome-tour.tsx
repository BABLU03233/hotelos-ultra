"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarRange,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  MessagesSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A first-run walkthrough of what each part of the dashboard is for.
 *
 * A new hotel owner lands on eight nav items with no idea which matters or in
 * what order — the setup checklist tells them what to DO, but nothing said
 * what CRM, Bulk Sender or Templates even are. This is that missing
 * explanation: one card per section, in the order they'll actually use them,
 * plain-language, skippable, and re-openable from the header afterwards.
 *
 * Whether it has been seen lives in localStorage, not the database: it is a
 * per-person "have I read this", needs no migration, and the worst case of a
 * cleared store is seeing a welcome screen twice — the mildest possible
 * failure. It is keyed by tenant so a second hotel on the same browser still
 * gets its own welcome.
 */
interface TourStep {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
}

function steps(agentName: string): TourStep[] {
  return [
    {
      icon: Sparkles,
      title: `Meet ${agentName}, your AI receptionist`,
      body: `${agentName} chats with guests on WhatsApp for you — answering questions, quoting rooms, and taking bookings, day and night. Everything in here either teaches ${agentName} or shows you what it's doing. Here's the quick tour.`,
    },
    {
      icon: LayoutDashboard,
      title: "Dashboard",
      body: "Your home screen. New leads, bookings, and how many chats need a human — at a glance. The setup checklist here is the fastest way to get live.",
      href: "/dashboard",
    },
    {
      icon: MessagesSquare,
      title: "CRM — your guest conversations",
      body: `Every WhatsApp chat, in one place. ${agentName} handles most of them on its own; the ones that need you are marked "Human mode" so nothing slips. You can jump in and reply any time.`,
      href: "/crm",
    },
    {
      icon: Settings,
      title: "Settings — teach your receptionist",
      body: `This is where ${agentName} learns your hotel: your rooms and prices, your address and check-in times, and your FAQs. The more you add here, the fewer questions ${agentName} has to pass to you. Connect WhatsApp here too — nothing works until you do.`,
      href: "/settings",
    },
    {
      icon: CalendarRange,
      title: "Calendar & Follow-ups",
      body: `The Calendar shows your bookings by date. Follow-ups are gentle nudges ${agentName} sends a guest who went quiet — a reminder, an offer, a last call — cancelled the moment they reply.`,
      href: "/calendar",
    },
    {
      icon: Megaphone,
      title: "Bulk Sender & Templates",
      body: "Send an offer to many guests at once from Bulk Sender. To reach guests who haven't messaged you recently, WhatsApp requires a pre-approved Template — we've got ready-to-send ones you can submit in a couple of taps.",
      href: "/templates",
    },
    {
      icon: BookOpen,
      title: "You're ready",
      body: "Start with the setup checklist on your Dashboard — add a room, connect WhatsApp, and send yourself a test message. You can reopen this tour any time from the ? in the top bar.",
      href: "/dashboard",
    },
  ];
}

function storageKey(tenantId: string): string {
  return `hotelos:welcome-tour:${tenantId}`;
}

/** Whether this tenant has already dismissed the tour on this device. */
function hasSeenTour(tenantId: string): boolean {
  try {
    return localStorage.getItem(storageKey(tenantId)) === "done";
  } catch {
    // Private windows and blocked site data throw on access — treat as unseen
    // rather than crash. Seeing the welcome once more is the whole cost.
    return false;
  }
}

function markTourSeen(tenantId: string) {
  try {
    localStorage.setItem(storageKey(tenantId), "done");
  } catch {
    /* Nothing to do — it just means we may show it again. */
  }
}

/** Subscribes to nothing — a stable empty store whose only job is to give a
 *  `false` on the server and first client render, then `true` after mount, so
 *  localStorage is read only where it exists and hydration cannot desync. */
function useMounted(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function WelcomeTour({ tenantId, agentName }: { tenantId: string; agentName: string }) {
  const mounted = useMounted();
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  const [index, setIndex] = React.useState(0);
  const tourSteps = React.useMemo(() => steps(agentName), [agentName]);

  // Open state is derived, not written from an effect. Until the owner acts,
  // it follows first-run (true when unseen, after mount); once they close or
  // reopen it, manualOpen takes over. This keeps the whole thing out of an
  // effect, which the repo's set-state-in-effect lint rule forbids.
  const firstRun = mounted && !hasSeenTour(tenantId);
  const open = manualOpen ?? firstRun;

  // The header's help button asks to reopen via a window event.
  React.useEffect(() => {
    function reopen() {
      setIndex(0);
      setManualOpen(true);
    }
    window.addEventListener("hotelos:open-tour", reopen);
    return () => window.removeEventListener("hotelos:open-tour", reopen);
  }, []);

  function close() {
    markTourSeen(tenantId);
    setManualOpen(false);
  }

  const step = tourSteps[index];
  const isLast = index === tourSteps.length - 1;
  const Icon = step.icon;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The tour only ever opens from first-run or the help button; the
        // Dialog itself can only ask to CLOSE (escape, backdrop, the X).
        if (!next) close();
      }}
    >
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="flex flex-col items-center gap-3 p-6 pb-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-6" />
          </span>
          <DialogTitle className="text-lg">{step.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{step.body}</DialogDescription>
        </DialogHeader>

        {/* Progress dots — clickable, so the tour is browsable, not a rail. */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {tourSteps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Step ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 p-3">
          <Button variant="ghost" size="sm" onClick={close}>
            {isLast ? "Close" : "Skip tour"}
          </Button>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" nativeButton={false} render={<Link href={step.href ?? "/dashboard"} />} onClick={close}>
                Go to Dashboard
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
