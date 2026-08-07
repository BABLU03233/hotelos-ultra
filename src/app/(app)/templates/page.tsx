import { Reveal } from "@/components/motion/reveal";
import { StaggerItem } from "@/components/motion/stagger-item";
import { MetaTemplateList } from "@/components/templates/meta-template-list";
import { TemplateCard } from "@/components/templates/template-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WA_TEMPLATES } from "@/lib/wa-templates";

export default function TemplatesPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Reveal>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Message templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Two different things live here: starter drafts you copy in and edit by hand, and real Meta-approved
            templates that can reach guests outside the 24-hour window.
          </p>
        </div>
      </Reveal>

      <Tabs defaultValue="meta">
        <TabsList>
          <TabsTrigger value="meta">Meta templates</TabsTrigger>
          <TabsTrigger value="starters">Starter copy</TabsTrigger>
        </TabsList>

        <TabsContent value="meta" className="mt-4">
          <MetaTemplateList />
        </TabsContent>

        <TabsContent value="starters" className="mt-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Copy one in and edit the <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{placeholders}}"}</code>{" "}
            before sending — no Meta approval needed to use these, but they only work inside the 24-hour window.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WA_TEMPLATES.map((t, i) => (
              <StaggerItem key={t.id} index={i}>
                <TemplateCard template={t} />
              </StaggerItem>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
