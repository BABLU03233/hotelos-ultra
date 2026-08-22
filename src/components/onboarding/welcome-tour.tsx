"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Clock,
  LayoutDashboard,
  LayoutTemplate,
  type LucideIcon,
  Megaphone,
  MessagesSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A guided, spotlighted walkthrough of the dashboard.
 *
 * The first version was a static modal that named each section in the middle
 * of the screen. The ask was to make it actually guide: route to each feature,
 * shine a light on the real nav item, and leave it clickable so the owner
 * walks the product rather than reading about it.
 *
 * So each step now navigates to that page and cuts a hole in a dark overlay
 * around the matching sidebar item — the classic coach-mark. The hole is
 * pointer-events:none, so the highlighted nav link underneath stays live: the
 * owner can click it themselves, or hit Next and be taken there.
 *
 * "Seen" lives in localStorage keyed by tenant — a per-person "have I read
 * this" that needs no migration, whose worst failure is showing the welcome
 * twice, and which keeps a second hotel on the same browser getting its own.
 */
interface TourStep {
  /** The sidebar item to spotlight, keyed to its data-tour (href minus slash).
   *  Absent on the intro/outro, which sit centered with the whole screen dim. */
  navKey?: string;
  href?: string;
  icon: LucideIcon;
  title: string;
  body: string;
}

function steps(agentName: string): TourStep[] {
  return [
    {
      icon: Sparkles,
      title: `Meet ${agentName}, your AI receptionist`,
      body: `${agentName} chats with guests on WhatsApp for you — answering questions, quoting rooms, taking bookings, day and night. Let's walk through where everything lives. It takes about a minute.`,
    },
    {
      navKey: "dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      title: "Dashboard",
      body: "Your home screen — new leads, bookings, and how many chats need a human, at a glance. The setup checklist here is the fastest way to get live.",
    },
    {
      navKey: "crm",
      href: "/crm",
      icon: MessagesSquare,
      title: "CRM — your guest conversations",
      body: `Every WhatsApp chat in one place. ${agentName} handles most on its own; the ones needing you are marked "Human mode". Tap in and reply any time.`,
    },
    {
      navKey: "follow-ups",
      href: "/follow-ups",
      icon: Clock,
      title: "Follow-ups",
      body: `Gentle nudges ${agentName} sends a guest who went quiet — a reminder, an offer, a last call — cancelled the moment they reply, so no one is ever pestered.`,
    },
    {
      navKey: "campaigns",
      href: "/campaigns",
      icon: Megaphone,
      title: "Bulk Sender",
      body: "Send an offer to many guests at once. Pick who gets it, write the message or attach a poster, and it goes out after a quick review.",
    },
    {
      navKey: "templates",
      href: "/templates",
      icon: LayoutTemplate,
      title: "Templates",
      body: "To reach guests who haven't messaged recently, WhatsApp needs a pre-approved template. We've got ready-to-send ones — pick 20% off, submit, done.",
    },
    {
      navKey: "knowledge",
      href: "/knowledge",
      icon: BookOpen,
      title: "Knowledge Base",
      body: `Upload your brochures and policies here. ${agentName} reads them and answers guests from them, so it can speak to the details of your hotel.`,
    },
    {
      navKey: "settings",
      href: "/settings",
      icon: Settings,
      title: "Settings — teach your receptionist",
      body: `Your rooms and prices, address, check-in times, FAQs — and the WhatsApp connection. Start here: nothing reaches ${agentName} until WhatsApp is connected.`,
    },
    {
      icon: Sparkles,
      title: "You're all set",
      body: "Start with the setup checklist on your Dashboard — add a room, connect WhatsApp, send yourself a test. You can reopen this tour any time from the ? in the top bar.",
      href: "/dashboard",
    },
  ];
}

function storageKey(tenantId: string): string {
  return `hotelos:welcome-tour:${tenantId}`;
}

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

/** false on the server and first client render, true after mount — so
 *  localStorage is read only where it exists and hydration cannot desync. */
function useMounted(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/**
 * The spotlit element's viewport rectangle, kept current across step changes,
 * scrolling and resizing.
 *
 * Every setRect fires inside requestAnimationFrame or an event listener, never
 * synchronously in the effect body — the repo forbids the latter, and a layout
 * read wants to happen after paint anyway.
 */
function useSpotlightRect(navKey: string | undefined, active: boolean): DOMRect | null {
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => {
    let raf = 0;
    // Every setRect is inside measure, and measure only ever runs from rAF, a
    // timeout, or an event — never synchronously in this effect body, which
    // the repo's set-state-in-effect rule forbids. The inactive case resets to
    // null the same way rather than with a bare synchronous setState.
    const measure = () => {
      if (!active || !navKey) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${navKey}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    // rAF so the read lands after the navigation's paint, and again shortly
    // after in case a banner shifted the sidebar down.
    raf = requestAnimationFrame(measure);
    const settle = setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [navKey, active]);

  return rect;
}

export function WelcomeTour({ tenantId, agentName }: { tenantId: string; agentName: string }) {
  const router = useRouter();
  const mounted = useMounted();
  const tourSteps = React.useMemo(() => steps(agentName), [agentName]);

  // null until the owner acts; then it pins open/closed. Until then it follows
  // first-run. Derived rather than written from an effect, per the repo's
  // set-state-in-effect rule.
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  const [index, setIndex] = React.useState(0);

  const firstRun = mounted && !hasSeenTour(tenantId);
  const open = manualOpen ?? firstRun;

  const step = tourSteps[index];
  const rect = useSpotlightRect(step.navKey, open);

  React.useEffect(() => {
    function reopen() {
      setIndex(0);
      setManualOpen(true);
    }
    window.addEventListener("hotelos:open-tour", reopen);
    return () => window.removeEventListener("hotelos:open-tour", reopen);
  }, []);

  /** Move to a step and route to its page, so the owner sees the real screen
   *  behind the spotlight. Navigation happens on the click, never in an
   *  effect. */
  function goTo(next: number) {
    const target = tourSteps[next];
    if (!target) return;
    setIndex(next);
    if (target.href) router.push(target.href);
  }

  function close() {
    markTourSeen(tenantId);
    setManualOpen(false);
  }

  if (!open) return null;

  const isLast = index === tourSteps.length - 1;
  const Icon = step.icon;

  // Where the tooltip card sits. Beside the spotlit nav item when there is one,
  // dead-centre for the intro and outro. Clamped so a short window never pushes
  // the card off-screen.
  const cardStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: Math.min(Math.max(rect.top - 8, 12), (typeof window !== "undefined" ? window.innerHeight : 800) - 340),
        left: rect.right + 16,
      }
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[70]">
      {/* The dim. A spotlight cutout when a nav item is targeted (the huge
          box-shadow spread darkens everything but the hole), a full sheet
          otherwise. pointer-events:none on the cutout so the highlighted nav
          link underneath stays clickable — the point of a guided tour. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-lg ring-2 ring-primary transition-all duration-300"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/70" />
      )}

      {/* The card. Always interactive, above the dim. */}
      <div
        role="dialog"
        aria-label="Product tour"
        style={cardStyle}
        className="pointer-events-auto flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
      >
        <div className="flex flex-col gap-3 p-5 pb-4">
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {/* Intro and outro are framing, not numbered; the middle steps
                  are "n of <feature count>". */}
              {index === 0 ? "Welcome" : isLast ? "Done" : `${index} of ${tourSteps.length - 2}`}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="font-heading text-base font-semibold">{step.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
        </div>

        {/* Progress dots — clickable, so the tour is browsable, not a rail. */}
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {tourSteps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Step ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 p-3">
          <Button variant="ghost" size="sm" onClick={close}>
            {isLast ? "Close" : "Skip"}
          </Button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={() => goTo(index - 1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={close}>
                Done
              </Button>
            ) : (
              <Button size="sm" onClick={() => goTo(index + 1)}>
                {index === 0 ? "Start tour" : "Next"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
