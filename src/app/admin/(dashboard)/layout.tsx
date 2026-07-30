import { redirect } from "next/navigation";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { getAdminSessionFromCookies } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSessionFromCookies();
  if (!session) redirect("/admin/login");

  const admin = await prisma.platformAdmin.findUnique({ where: { id: session.adminId } });
  if (!admin) redirect("/admin/login");

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <AdminTopbar name={admin.name} />
      <main className="flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6">{children}</main>
    </div>
  );
}
