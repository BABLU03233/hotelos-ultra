"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
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

export function WhatsAppSettings() {
  const { data, loading, reload } = useFetch<WhatsAppStatus>("/api/settings/whatsapp");
  const [phoneNumberId, setPhoneNumberId] = React.useState("");
  const [wabaId, setWabaId] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setPhoneNumberId(data.phoneNumberId ?? "");
      setWabaId(data.wabaId ?? "");
    }
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings/whatsapp", {
        method: "PUT",
        body: JSON.stringify({ phoneNumberId, wabaId: wabaId || undefined, accessToken }),
      });
      toast.success("WhatsApp connected");
      setAccessToken("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect WhatsApp");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) return <Skeleton className="h-64 w-full" />;

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
        <CardDescription>
          From your Meta App → WhatsApp → API Setup. Owner only. The webhook callback URL to paste into Meta is{" "}
          <code className="rounded bg-muted px-1 py-0.5">{`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/whatsapp`}</code>.
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
        <Button onClick={save} disabled={saving || !phoneNumberId || !accessToken} className="w-fit sm:col-span-2">
          {saving ? "Saving…" : "Save connection"}
        </Button>
      </CardContent>
    </Card>
  );
}
