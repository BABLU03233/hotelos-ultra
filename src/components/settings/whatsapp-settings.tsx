"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";

interface WhatsAppStatus {
  connected: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
}

interface TestResult {
  displayNumber: string;
  verifiedName: string;
}

export function WhatsAppSettings() {
  const { data, loading, reload } = useFetch<WhatsAppStatus>("/api/settings/whatsapp");

  if (loading || !data) return <Skeleton className="h-64 w-full" />;

  return <WhatsAppSettingsForm data={data} reload={reload} />;
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
        <CardDescription className="flex flex-col gap-1">
          <span>
            Owner only. From your Meta App: WhatsApp → API Setup gives you the phone number ID and a temporary token;
            Business Settings → System Users gives you a permanent one.
          </span>
          <span>
            Paste this as the webhook callback URL in the Meta App dashboard:{" "}
            <code className="rounded bg-muted px-1 py-0.5">{`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/whatsapp`}</code>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Phone number ID</Label>
          <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>WABA ID (optional)</Label>
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
      </CardContent>
    </Card>
  );
}
