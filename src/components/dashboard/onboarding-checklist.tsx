import Link from "next/link";
import { CheckCircle2, Circle, PartyPopper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "@/types";

interface ChecklistItem {
  key: string;
  label: string;
  why: string;
  done: boolean;
  href: string;
  cta: string;
  hardest?: boolean;
}

export function OnboardingChecklist({ setup, agentName = "Anushka" }: { setup: DashboardMetrics["setup"]; agentName?: string }) {
  // Ordered to match the Settings tabs themselves (Hotel → Rooms → FAQs → WhatsApp), not by how hard each step is.
  const items: ChecklistItem[] = [
    {
      key: "profile",
      label: "Add your hotel profile",
      why: `So ${agentName} knows your address, check-in time, and policies when guests ask.`,
      done: setup.hotelProfileComplete,
      href: "/settings?tab=hotel",
      cta: "Add",
    },
    {
      key: "room",
      label: "Add your first room",
      why: `${agentName} can't recommend a room to a guest until at least one exists.`,
      done: setup.roomCount > 0,
      href: "/settings?tab=rooms",
      cta: "Add",
    },
    {
      key: "faq",
      label: "Add an FAQ",
      why: `The more ${agentName} knows, the less it has to escalate to your team.`,
      done: setup.faqCount > 0,
      href: "/settings?tab=faqs",
      cta: "Add",
    },
    {
      key: "whatsapp",
      label: "Connect WhatsApp",
      why: `Nothing else works until guests can actually reach ${agentName}.`,
      done: setup.whatsappConnected,
      href: "/settings?tab=whatsapp",
      cta: "Go",
      hardest: true,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  const progressDeg = (doneCount / items.length) * 360;

  if (allDone) {
    return (
      <Reveal delay={40}>
        <Card>
          <CardContent className="flex items-center justify-between gap-2 py-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <PartyPopper className="size-4 text-[var(--color-chart-2)]" /> Setup complete — {agentName}&apos;s ready to go.
            </span>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/settings" />}>
              Review setup
            </Button>
          </CardContent>
        </Card>
      </Reveal>
    );
  }

  return (
    <Reveal delay={40}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{
                  background: `conic-gradient(var(--color-primary) ${progressDeg}deg, color-mix(in oklch, var(--muted-foreground), transparent 75%) 0deg)`,
                }}
              >
                <span className="flex size-4.5 items-center justify-center rounded-full bg-card text-[9px] font-bold text-foreground">
                  {doneCount}
                </span>
              </span>
              Get HotelOS Ultra ready to go
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {doneCount} of {items.length} done
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
              {item.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 self-start text-[var(--color-chart-2)]" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 self-start text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-1.5 text-sm", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                  {item.label}
                  {item.hardest && !item.done && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      Takes the longest
                    </Badge>
                  )}
                </span>
                {!item.done && <p className="text-[11px] text-muted-foreground">{item.why}</p>}
              </div>
              {!item.done && (
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    item.key === "whatsapp"
                      ? "shrink-0 border-[#25D366] text-[#128C4A] hover:bg-[#25D366]/10"
                      : "shrink-0 border-primary text-primary"
                  }
                  nativeButton={false}
                  render={<Link href={item.href} />}
                >
                  {item.cta} →
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </Reveal>
  );
}
