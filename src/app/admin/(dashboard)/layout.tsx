import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { getAdminSessionFromCookies } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSessionFromCookies();
  if (!session) redirect("/admin/login");

  const admin = await prisma.platformAdmin.findUnique({ where: { id: session.adminId } });
  if (!admin) redirect("/admin/login");

  // Counted here so the sidebar can show a waiting-work badge on every admin
  // page, without a client-side poll.
  const pendingReviews = await prisma.campaign.count({ where: { approval: "PENDING_REVIEW" } });

  return (
    // See the owner shell for why h-dvh rather than min-h-dvh.
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <AdminTopbar name={admin.name} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AdminSidebar pendingReviews={pendingReviews} />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
