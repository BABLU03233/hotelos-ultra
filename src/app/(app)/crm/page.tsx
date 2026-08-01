import { CrmWorkspace } from "@/components/crm/crm-workspace";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const { contact } = await searchParams;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">CRM</h1>
        <p className="text-sm text-muted-foreground">Every guest who&apos;s messaged you, and the full conversation with Aria.</p>
      </div>
      <CrmWorkspace initialContactId={contact ?? null} />
    </div>
  );
}
