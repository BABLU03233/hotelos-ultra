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

const FIELDS: { key: keyof HotelProfile; label: string; textarea?: boolean; placeholder?: string }[] = [
  { key: "name", label: "Hotel name" },
  { key: "address", label: "Address" },
  { key: "googleMapsUrl", label: "Google Maps link", placeholder: "e.g. https://maps.app.goo.gl/... or https://share.google/..." },
  { key: "checkInTime", label: "Check-in time (e.g. 14:00)" },
  { key: "checkOutTime", label: "Check-out time (e.g. 11:00)" },
  { key: "businessHours", label: "Business hours", placeholder: "e.g. 24/7 front desk, restaurant 7am–11pm" },
  { key: "wifiInfo", label: "Wi-Fi info", textarea: true, placeholder: "e.g. Free Wi-Fi, network 'HotelName_Guest', password given at check-in" },
  { key: "parkingInfo", label: "Parking", textarea: true, placeholder: "e.g. Free self-parking, 20 spots, valet available on request" },
  { key: "restaurantInfo", label: "Restaurant", textarea: true, placeholder: "e.g. In-house restaurant, breakfast 7–10am, multi-cuisine dinner till 11pm" },
  { key: "cancellationPolicy", label: "Cancellation policy", textarea: true, placeholder: "e.g. Free cancellation up to 48 hours before check-in" },
  { key: "refundPolicy", label: "Refund policy", textarea: true, placeholder: "e.g. Refunds processed within 5–7 business days" },
  { key: "nearbyAttractions", label: "Nearby attractions", textarea: true, placeholder: "e.g. 10 min from City Beach, 5 min from Central Market" },
];

export function HotelSettings() {
  const { data, loading } = useFetch<{ profile: HotelProfile | null }>("/api/settings/hotel");

  if (loading) return <Skeleton className="h-96 w-full" />;

  return <HotelSettingsForm initialProfile={data?.profile ?? null} />;
}

function HotelSettingsForm({ initialProfile }: { initialProfile: HotelProfile | null }) {
  const [form, setForm] = React.useState<Partial<HotelProfile>>(initialProfile ?? {});
  const [saving, setSaving] = React.useState(false);
  const agentName = form.aiAgentName?.trim() || "Anushka";

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
          <CardTitle>AI agent name</CardTitle>
          <CardDescription>What your WhatsApp concierge calls itself when chatting with guests.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Agent name</Label>
            <Input
              value={form.aiAgentName ?? ""}
              onChange={(e) => setForm({ ...form, aiAgentName: e.target.value })}
              placeholder="Anushka"
              maxLength={50}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Booking reference code prefix</Label>
            <Input
              value={form.bookingCodePrefix ?? ""}
              onChange={(e) => setForm({ ...form, bookingCodePrefix: e.target.value.toUpperCase() })}
              placeholder="e.g. IVR — leave blank to auto-generate from hotel name"
              maxLength={6}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hotel information</CardTitle>
          <CardDescription>What {agentName} tells guests when they ask about the property.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={`flex flex-col gap-1.5 ${f.textarea ? "sm:col-span-2" : ""}`}>
              <Label>{f.label}</Label>
              {f.textarea ? (
                <Textarea
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="min-h-16"
                />
              ) : (
                <Input
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI instructions</CardTitle>
          <CardDescription>Extra guidance for {agentName} — tone, things to always mention, things to avoid.</CardDescription>
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
