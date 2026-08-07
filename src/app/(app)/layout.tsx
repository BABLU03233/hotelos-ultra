import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-shell/app-header";
import { AuthHydrator } from "@/components/app-shell/auth-hydrator";
import { Sidebar } from "@/components/app-shell/sidebar";
import { WhatsAppBanner } from "@/components/app-shell/whatsapp-banner";
import { getSessionFromCookies } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const [user, tenant, hotelProfile] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.tenant.findUnique({ where: { id: session.tenantId } }),
    prisma.hotelProfile.findUnique({ where: { tenantId: session.tenantId }, select: { aiAgentName: true } }),
  ]);
  if (!user || !tenant) redirect("/login");
  const agentName = hotelProfile?.aiAgentName || "Anushka";

  return (
    <div className="flex min-h-dvh w-full">
      <AuthHydrator
        user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
        tenant={{ id: tenant.id, name: tenant.name, slug: tenant.slug, aiAgentName: agentName }}
      />
      <Sidebar hotelName={tenant.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader hotelName={tenant.name} userName={user.name} userEmail={user.email} />
        {!tenant.whatsappPhoneNumberId && <WhatsAppBanner agentName={agentName} />}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
