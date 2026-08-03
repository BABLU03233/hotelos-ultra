import { AdminAccountSettings } from "@/components/admin/admin-account-settings";

export default function AdminAccountPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your own platform admin login.</p>
      </div>

      <AdminAccountSettings />
    </div>
  );
}
