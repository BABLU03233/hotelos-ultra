import { Bot, CalendarCheck, Clock, MessagesSquare, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/dashboard/get-metrics";

export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  const metrics = await getDashboardMetrics(session!.tenantId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">What&apos;s happening across your WhatsApp pipeline right now.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard label="New leads" value={metrics.newLeads} icon={UserPlus} />
        <MetricCard label="Active chats (24h)" value={metrics.activeChats} icon={MessagesSquare} />
        <MetricCard label="Bookings" value={metrics.bookings} icon={CalendarCheck} />
        <MetricCard label="Pending follow-ups" value={metrics.pendingFollowUps} icon={Clock} />
        <MetricCard label="AI conversations today" value={metrics.aiConversationsToday} icon={Bot} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent campaign performance</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.campaignPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns sent yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {metrics.campaignPerformance.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.sent} sent · {c.replies} replies
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
