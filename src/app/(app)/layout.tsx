import { redirect } from "next/navigation";
import { AuthHydrator } from "@/components/app-shell/auth-hydrator";
import { Sidebar } from "@/components/app-shell/sidebar";
import { UserMenu } from "@/components/app-shell/user-menu";
import { getSessionFromCookies } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
  ]);
  if (!user || !tenant) redirect("/login");

  return (
    <div className="flex min-h-dvh w-full">
      <AuthHydrator
        user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
        tenant={{ id: tenant.id, name: tenant.name, slug: tenant.slug }}
      />
      <Sidebar hotelName={tenant.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b border-border px-4 md:px-6">
          <UserMenu name={user.name} email={user.email} />
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
