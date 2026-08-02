import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { Reveal } from "@/components/motion/reveal";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const { contact } = await searchParams;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Reveal>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every guest who&apos;s messaged you, and the full conversation with Anushka.</p>
        </div>
      </Reveal>
      <CrmWorkspace initialContactId={contact ?? null} />
    </div>
  );
}
