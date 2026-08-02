import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "@/types";

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  href: string;
  cta: string;
  /** chart-1..5 token index — same shared palette used across dashboard/sidebar/CRM. */
  tone: 1 | 2 | 3 | 4 | 5;
}

export function OnboardingChecklist({ setup }: { setup: DashboardMetrics["setup"] }) {
  const items: ChecklistItem[] = [
    { key: "profile", label: "Add your hotel profile", done: setup.hotelProfileComplete, href: "/settings?tab=hotel", cta: "Add", tone: 1 },
    { key: "room", label: "Add your first room", done: setup.roomCount > 0, href: "/settings?tab=rooms", cta: "Add", tone: 3 },
    { key: "whatsapp", label: "Connect WhatsApp", done: setup.whatsappConnected, href: "/settings?tab=whatsapp", cta: "Go", tone: 2 },
    { key: "faq", label: "Add an FAQ", done: setup.faqCount > 0, href: "/settings?tab=faqs", cta: "Add", tone: 5 },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  const progressDeg = (doneCount / items.length) * 360;

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
          {items.map((item) => {
            const toneVar = `var(--color-chart-${item.tone})`;
            return (
              <div key={item.key} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                {item.done ? (
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-chart-2)" }} />
                ) : (
                  <Circle className="size-4 shrink-0" style={{ color: toneVar }} />
                )}
                <span className={cn("flex-1 text-sm", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                  {item.label}
                </span>
                {!item.done && (
                  <Button size="sm" variant="outline" style={{ borderColor: toneVar, color: toneVar }} render={<Link href={item.href} />}>
                    {item.cta} →
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </Reveal>
  );
}
