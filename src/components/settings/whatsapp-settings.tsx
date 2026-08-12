"use client";

import * as React from "react";
import { CalendarDays, Check, CheckCircle2, CircleAlert, Copy, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { GlossaryTerm } from "@/components/shared/glossary-term";
import { InfoCallout } from "@/components/shared/info-callout";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";

interface WhatsAppStatus {
  connected: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  bookingFlowId: string | null;
  roomCount: number;
}

interface TestResult {
  displayNumber: string;
  verifiedName: string;
}

const WEBHOOK_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/whatsapp`;

export function WhatsAppSettings() {
  const { data, loading, reload } = useFetch<WhatsAppStatus>("/api/settings/whatsapp");

  if (loading || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <WhatsAppSettingsForm data={data} reload={reload} />
      <BookingCalendarCard data={data} reload={reload} />
    </div>
  );
}

/**
 * Publishes the native in-WhatsApp booking calendar. Separate card from the
 * connection above because it's a genuinely different action with its own
 * prerequisites (a live connection AND at least one room), and because
 * publishing is one-way at Meta's end — worth its own deliberate button
 * rather than riding along with "Save connection".
 */
function BookingCalendarCard({ data, reload }: { data: WhatsAppStatus; reload: () => void }) {
  const [publishing, setPublishing] = React.useState(false);
  const blocked = !data.connected ? "Connect WhatsApp above first." : data.roomCount === 0 ? "Add at least one room in Settings → Rooms first." : null;

  async function publish() {
    setPublishing(true);
    try {
      const res = await apiFetch<{ flowId: string; roomCount: number }>("/api/settings/whatsapp/booking-flow", { method: "POST" });
      toast.success(`Booking calendar published with ${res.roomCount} room${res.roomCount === 1 ? "" : "s"}`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't publish the booking calendar");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Booking calendar
          {data.bookingFlowId ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="size-3.5" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
              <CircleAlert className="size-3.5" /> Not published
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Lets guests pick their room and dates on a real calendar inside WhatsApp, then book in one tap — instead of
          answering questions one at a time.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InfoCallout title="Your rooms are baked in when you publish" tone="warning">
          The calendar carries a snapshot of your room names and prices taken at the moment you publish. If you change
          rooms or rates later, publish again so guests see the new ones.
        </InfoCallout>

        {blocked && <p className="text-xs text-amber-600">{blocked}</p>}

        <div className="flex items-center gap-2">
          <Button onClick={publish} disabled={publishing || Boolean(blocked)}>
            <CalendarDays /> {publishing ? "Publishing…" : data.bookingFlowId ? "Publish again" : "Publish booking calendar"}
          </Button>
          {data.bookingFlowId && <code className="truncate rounded bg-muted px-1.5 py-1 text-xs">Flow {data.bookingFlowId}</code>}
        </div>
      </CardContent>
    </Card>
  );
}

function SetupGuide() {
  const [copied, setCopied] = React.useState(false);

  async function copyWebhookUrl() {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">1.</span> Create a{" "}
          <GlossaryTerm term="meta-app" /> at{" "}
          <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
            developers.facebook.com
          </a>{" "}
          and add the &quot;WhatsApp Business Platform&quot; product.
        </li>
        <li>
          <span className="font-medium text-foreground">2.</span> Open{" "}
          <span className="font-medium text-foreground">WhatsApp → API Setup</span> — copy the{" "}
          <span className="font-medium text-foreground">Phone number ID</span> and a temporary{" "}
          <GlossaryTerm term="token" />
          {" "}into the fields below.
        </li>
        <li>
          <span className="font-medium text-foreground">3.</span> That token expires in ~24 hours. For one that
          doesn&apos;t, go to <span className="font-medium text-foreground">Business Settings → System Users</span>{" "}
          instead and generate a token for a <GlossaryTerm term="system-user" />.
        </li>
        <li>
          <span className="font-medium text-foreground">4.</span> In your Meta App&apos;s{" "}
          <span className="font-medium text-foreground">WhatsApp → Configuration</span>, register this as the{" "}
          <GlossaryTerm term="webhook" />
          {" "}callback URL, subscribed to the &quot;messages&quot; field:
          <div className="mt-1 flex items-center gap-1.5">
            <code className="flex-1 truncate rounded bg-muted px-1.5 py-1 text-xs">{WEBHOOK_URL}</code>
            <Button variant="outline" size="icon-sm" onClick={copyWebhookUrl} className="shrink-0">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </li>
      </ol>

      <InfoCallout title="One extra step Meta doesn't make obvious" tone="warning">
        Your <GlossaryTerm term="waba" />
        {" "}also needs to be separately subscribed to receive events for this app —
        registering the webhook above isn&apos;t enough on its own. If everything looks correctly configured but
        messages still aren&apos;t arriving, this is almost always why. It&apos;s done via a one-time API call to{" "}
        <code className="rounded bg-background/50 px-1 py-0.5 text-[11px]">/&#123;waba-id&#125;/subscribed_apps</code>{" "}
        — ask your developer, or tell us and we&apos;ll do it for you.
      </InfoCallout>
    </div>
  );
}

function WhatsAppSettingsForm({ data, reload }: { data: WhatsAppStatus; reload: () => void }) {
  const [phoneNumberId, setPhoneNumberId] = React.useState(data.phoneNumberId ?? "");
  const [wabaId, setWabaId] = React.useState(data.wabaId ?? "");
  const [accessToken, setAccessToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<TestResult>("/api/settings/whatsapp/test", {
        method: "POST",
        body: JSON.stringify({ phoneNumberId, accessToken }),
      });
      setTestResult(result);
      toast.success(`Confirmed: ${result.displayNumber} (${result.verifiedName})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't verify these credentials");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings/whatsapp", {
        method: "PUT",
        body: JSON.stringify({ phoneNumberId, wabaId: wabaId || undefined, accessToken }),
      });
      toast.success("WhatsApp connected");
      setAccessToken("");
      setTestResult(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect WhatsApp");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          WhatsApp connection
          {data.connected ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="size-3.5" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
              <CircleAlert className="size-3.5" /> Not connected
            </span>
          )}
        </CardTitle>
        <CardDescription>Owner only. The hardest step — worth reading through once.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SetupGuide />

        <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Phone number ID</Label>
            <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              <GlossaryTerm term="waba">WhatsApp Business Account ID</GlossaryTerm> (optional)
            </Label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Access token</Label>
            <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Stored encrypted" />
          </div>

          {testResult && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs text-emerald-700 sm:col-span-2 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Verified — {testResult.displayNumber} ({testResult.verifiedName})
            </div>
          )}

          <div className="flex gap-2 sm:col-span-2">
            <Button
              variant="outline"
              onClick={test}
              disabled={testing || !phoneNumberId || !accessToken}
            >
              <PlugZap /> {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button
              onClick={save}
              disabled={saving || !phoneNumberId || !accessToken}
              className="bg-[#25D366] text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_4px_14px_-4px_#25D366] hover:bg-[#20bd5a] hover:brightness-100"
            >
              {saving ? "Saving…" : "Save connection"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
