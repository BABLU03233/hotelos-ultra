import { Bot, CalendarCheck, Clock, MessagesSquare, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";
import { StaggerItem } from "@/components/motion/stagger-item";
import { DashboardAttentionPanel } from "@/components/dashboard/attention-panel";
import { CampaignPerformanceChart } from "@/components/dashboard/campaign-performance-chart";
import { LeadFunnelChart } from "@/components/dashboard/lead-funnel-chart";
import { LeadSourceChart } from "@/components/dashboard/lead-source-chart";
import { MessageVolumeChart } from "@/components/dashboard/message-volume-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/dashboard/get-metrics";

export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  const metrics = await getDashboardMetrics(session!.tenantId);

  const hasMessageVolume = metrics.messageVolumeTrend.some((d) => d.inbound || d.ai || d.staff);
  const hasLeadFunnel = Object.values(metrics.leadFunnel).some((v) => v > 0);
  const hasLeadSources = Object.values(metrics.leadsBySource).some((v) => v > 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Reveal>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">What&apos;s happening across your WhatsApp pipeline right now.</p>
        </div>
      </Reveal>

      <OnboardingChecklist setup={metrics.setup} />

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5">
        <StaggerItem index={0}>
          <MetricCard label="New leads" value={metrics.newLeads} icon={UserPlus} />
        </StaggerItem>
        <StaggerItem index={1}>
          <MetricCard
            label="Active chats (24h)"
            value={metrics.activeChats}
            icon={MessagesSquare}
            previous={metrics.activeChatsPrev}
          />
        </StaggerItem>
        <StaggerItem index={2}>
          <MetricCard label="Bookings" value={metrics.bookings} icon={CalendarCheck} />
        </StaggerItem>
        <StaggerItem index={3}>
          <MetricCard label="Pending follow-ups" value={metrics.pendingFollowUps} icon={Clock} />
        </StaggerItem>
        <StaggerItem index={4}>
          <MetricCard
            label="AI conversations today"
            value={metrics.aiConversationsToday}
            icon={Bot}
            previous={metrics.aiConversationsPrev}
          />
        </StaggerItem>
      </div>

      <Reveal delay={120}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Message volume — last 14 days</CardTitle>
              <CardDescription>Who&apos;s actually doing the talking: guests, Anushka, or your team.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {hasMessageVolume ? (
                <MessageVolumeChart trend={metrics.messageVolumeTrend} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs text-muted-foreground">Once guests start messaging in, activity shows up here.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Conversations Anushka couldn&apos;t handle confidently.</CardDescription>
            </CardHeader>
            <CardContent>
              <DashboardAttentionPanel initialCount={metrics.unresolvedNotificationCount} initialNotifications={metrics.recentNotifications} />
            </CardContent>
          </Card>
        </div>
      </Reveal>

      <Reveal delay={60}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead pipeline</CardTitle>
              <CardDescription>Every contact, by stage.</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {hasLeadFunnel ? (
                <LeadFunnelChart funnel={metrics.leadFunnel} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm font-medium">No leads yet</p>
                  <p className="text-xs text-muted-foreground">New contacts show up here by stage.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leads by source</CardTitle>
              <CardDescription>Where they came from.</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {hasLeadSources ? (
                <LeadSourceChart bySource={metrics.leadsBySource} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm font-medium">No leads yet</p>
                  <p className="text-xs text-muted-foreground">See where they came from once they start coming in.</p>
                </div>
              )}
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
      </Reveal>
    </div>
  );
}
