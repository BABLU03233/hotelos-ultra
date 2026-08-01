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
}

export function OnboardingChecklist({ setup }: { setup: DashboardMetrics["setup"] }) {
  const items: ChecklistItem[] = [
    { key: "profile", label: "Add your hotel profile", done: setup.hotelProfileComplete, href: "/settings?tab=hotel", cta: "Add" },
    { key: "room", label: "Add your first room", done: setup.roomCount > 0, href: "/settings?tab=rooms", cta: "Add" },
    { key: "whatsapp", label: "Connect WhatsApp", done: setup.whatsappConnected, href: "/settings?tab=whatsapp", cta: "Go" },
    { key: "faq", label: "Add an FAQ", done: setup.faqCount > 0, href: "/settings?tab=faqs", cta: "Add" },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  return (
    <Reveal delay={40}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            Get HotelOS Ultra ready to go
            <span className="text-xs font-normal text-muted-foreground">
              {doneCount} of {items.length} done
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
              {item.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn("flex-1 text-sm", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                {item.label}
              </span>
              {!item.done && (
                <Button size="sm" variant="outline" render={<Link href={item.href} />}>
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
