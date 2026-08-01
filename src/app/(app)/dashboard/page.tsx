import { Bot, CalendarCheck, Clock, MessagesSquare, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardAttentionPanel } from "@/components/dashboard/attention-panel";
import { CampaignPerformanceChart } from "@/components/dashboard/campaign-performance-chart";
import { LeadFunnelChart } from "@/components/dashboard/lead-funnel-chart";
import { MessageVolumeChart } from "@/components/dashboard/message-volume-chart";
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
        <MetricCard label="Active chats (24h)" value={metrics.activeChats} icon={MessagesSquare} previous={metrics.activeChatsPrev} />
        <MetricCard label="Bookings" value={metrics.bookings} icon={CalendarCheck} />
        <MetricCard label="Pending follow-ups" value={metrics.pendingFollowUps} icon={Clock} />
        <MetricCard
          label="AI conversations today"
          value={metrics.aiConversationsToday}
          icon={Bot}
          previous={metrics.aiConversationsPrev}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Message volume — last 14 days</CardTitle>
            <CardDescription>Who&apos;s actually doing the talking: guests, Aria, or your team.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <MessageVolumeChart trend={metrics.messageVolumeTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Conversations Aria couldn&apos;t handle confidently.</CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardAttentionPanel initialCount={metrics.unresolvedNotificationCount} initialNotifications={metrics.recentNotifications} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lead pipeline</CardTitle>
            <CardDescription>Every contact, by stage.</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <LeadFunnelChart funnel={metrics.leadFunnel} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent campaign performance</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {metrics.campaignPerformance.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                <p className="text-sm font-medium">No campaigns sent yet</p>
                <p className="text-xs text-muted-foreground">Broadcast one from the Campaigns tab to see performance here.</p>
              </div>
            ) : (
              <CampaignPerformanceChart campaigns={metrics.campaignPerformance} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
