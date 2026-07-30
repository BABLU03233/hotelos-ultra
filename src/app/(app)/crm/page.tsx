import { CrmWorkspace } from "@/components/crm/crm-workspace";

export default function CrmPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">CRM</h1>
        <p className="text-sm text-muted-foreground">Every guest who&apos;s messaged you, and the full conversation with Aria.</p>
      </div>
      <CrmWorkspace />
    </div>
  );
}
