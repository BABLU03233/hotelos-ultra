"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { HotelProfile } from "@/types";

const FIELDS: { key: keyof HotelProfile; label: string; textarea?: boolean }[] = [
  { key: "name", label: "Hotel name" },
  { key: "address", label: "Address" },
  { key: "checkInTime", label: "Check-in time (e.g. 14:00)" },
  { key: "checkOutTime", label: "Check-out time (e.g. 11:00)" },
  { key: "businessHours", label: "Business hours" },
  { key: "wifiInfo", label: "Wi-Fi info", textarea: true },
  { key: "parkingInfo", label: "Parking", textarea: true },
  { key: "restaurantInfo", label: "Restaurant", textarea: true },
  { key: "cancellationPolicy", label: "Cancellation policy", textarea: true },
  { key: "refundPolicy", label: "Refund policy", textarea: true },
  { key: "nearbyAttractions", label: "Nearby attractions", textarea: true },
];

export function HotelSettings() {
  const { data, loading } = useFetch<{ profile: HotelProfile | null }>("/api/settings/hotel");

  if (loading) return <Skeleton className="h-96 w-full" />;

  return <HotelSettingsForm initialProfile={data?.profile ?? null} />;
}

function HotelSettingsForm({ initialProfile }: { initialProfile: HotelProfile | null }) {
  const [form, setForm] = React.useState<Partial<HotelProfile>>(initialProfile ?? {});
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings/hotel", { method: "PUT", body: JSON.stringify(form) });
      toast.success("Hotel info saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Hotel information</CardTitle>
          <CardDescription>What Aria tells guests when they ask about the property.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={`flex flex-col gap-1.5 ${f.textarea ? "sm:col-span-2" : ""}`}>
              <Label>{f.label}</Label>
              {f.textarea ? (
                <Textarea
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="min-h-16"
                />
              ) : (
                <Input value={(form[f.key] as string) ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI instructions</CardTitle>
          <CardDescription>Extra guidance for Aria — tone, things to always mention, things to avoid.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.aiSystemPrompt ?? ""}
            onChange={(e) => setForm({ ...form, aiSystemPrompt: e.target.value })}
            placeholder="e.g. Always mention our free breakfast when guests ask about rates."
            className="min-h-24"
          />
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} className="w-fit">
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
