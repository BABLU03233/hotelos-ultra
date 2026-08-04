import { Reveal } from "@/components/motion/reveal";
import { StaggerItem } from "@/components/motion/stagger-item";
import { TemplateCard } from "@/components/templates/template-card";
import { WA_TEMPLATES } from "@/lib/wa-templates";

export default function TemplatesPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Reveal>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Message templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Starter drafts for every stage of a guest&apos;s stay — copy one in and edit the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{placeholders}}"}</code> before sending.
            These aren&apos;t Meta-approved templates (no approval needed to use them) — that&apos;s a separate,
            official thing you set up in Meta Business Manager for messaging guests outside the 24-hour window.
          </p>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WA_TEMPLATES.map((t, i) => (
          <StaggerItem key={t.id} index={i}>
            <TemplateCard template={t} />
          </StaggerItem>
        ))}
      </div>
    </div>
  );
}
