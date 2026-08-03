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
            Ready-to-send WhatsApp copy for every stage of a guest&apos;s stay. Copy one here, or insert it directly
            while creating a campaign or follow-up step.
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
