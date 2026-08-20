import { Bot, CalendarCheck, Clock, Flame, Megaphone, MessagesSquare, PieChart, UserPlus, UserRound } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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

      <OnboardingChecklist setup={metrics.setup} agentName={metrics.aiAgentName} />

      {/* The two figures that name work, first — a dashboard should open with
          what needs doing, not with a total. Both link straight to the filtered
          chat list rather than making the owner go and find it. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StaggerItem index={0}>
          <MetricCard
            label="Hot leads"
            value={metrics.hotLeads}
            icon={Flame}
            href="/crm?filter=HOT"
            hint="Close to booking, gone quiet"
          />
        </StaggerItem>
        <StaggerItem index={1}>
          <MetricCard
            label="Needs a person"
            value={metrics.needsHuman}
            icon={UserRound}
            href="/crm?filter=HUMAN"
            hint={`${metrics.aiAgentName} is not replying to these`}
          />
        </StaggerItem>
        <StaggerItem index={2}>
          <MetricCard label="New leads" value={metrics.newLeads} icon={UserPlus} href="/crm?filter=NEW" />
        </StaggerItem>
        <StaggerItem index={3}>
          <MetricCard label="Bookings" value={metrics.bookings} icon={CalendarCheck} href="/crm?filter=BOOKED" />
        </StaggerItem>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3">
        <StaggerItem index={0}>
          <MetricCard
            label="Active chats (24h)"
            value={metrics.activeChats}
            icon={MessagesSquare}
            previous={metrics.activeChatsPrev}
          />
        </StaggerItem>
        <StaggerItem index={1}>
          <MetricCard label="Pending follow-ups" value={metrics.pendingFollowUps} icon={Clock} href="/follow-ups" />
        </StaggerItem>
        <StaggerItem index={2}>
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
              <CardDescription>Who&apos;s actually doing the talking: guests, {metrics.aiAgentName}, or your team.</CardDescription>
              <CardAction className="text-right text-xs text-muted-foreground">
                <p>
                  Today: <span className="font-semibold text-foreground tabular-nums">{metrics.aiMessagesToday}</span> by {metrics.aiAgentName}
                </p>
                <p>
                  <span className="font-semibold text-foreground tabular-nums">{metrics.staffMessagesToday}</span> by staff
                </p>
              </CardAction>
            </CardHeader>
            <CardContent className="h-64">
              {hasMessageVolume ? (
                <MessageVolumeChart trend={metrics.messageVolumeTrend} agentName={metrics.aiAgentName} />
              ) : (
                <EmptyState
                  icon={MessagesSquare}
                  title="No messages yet"
                  description="Once guests start messaging in, activity shows up here."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Conversations {metrics.aiAgentName} couldn&apos;t handle confidently.</CardDescription>
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
                <EmptyState icon={UserPlus} title="No leads yet" description="New contacts show up here by stage." />
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
                <EmptyState
                  icon={PieChart}
                  title="No leads yet"
                  description="See where they came from once they start coming in."
                />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent campaign performance</CardTitle>
            </CardHeader>
            <CardContent className="h-56">
              {metrics.campaignPerformance.length === 0 ? (
                <EmptyState
                  icon={Megaphone}
                  title="No campaigns sent yet"
                  description="Broadcast one from the Campaigns tab to see performance here."
                />
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
