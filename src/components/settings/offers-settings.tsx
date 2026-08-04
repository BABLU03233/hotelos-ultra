"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { Offer } from "@/types";

function OfferCard({ offer, onChanged }: { offer: Offer; onChanged: () => void }) {
  const [form, setForm] = React.useState(offer);

  async function save(patch: Partial<Offer> = {}) {
    const next = { ...form, ...patch };
    setForm(next);
    await apiFetch(`/api/settings/offers/${offer.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: next.title, description: next.description, discount: next.discount, active: next.active }),
    });
    onChanged();
  }

  async function remove() {
    await apiFetch(`/api/settings/offers/${offer.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} onBlur={() => save()} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Discount</Label>
            <Input
              value={form.discount ?? ""}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
              onBlur={() => save()}
              placeholder="20% off"
            />
          </div>
        </div>
        <Input
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          onBlur={() => save()}
          placeholder="Description"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.active} onCheckedChange={(checked) => save({ active: checked })} />
            {form.active ? "Active" : "Inactive"}
          </label>
          <Button variant="ghost" size="icon-sm" onClick={remove}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddOfferDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch("/api/settings/offers", { method: "POST", body: JSON.stringify({ title: title.trim(), active: true }) });
      setOpen(false);
      setTitle("");
      onAdded();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="w-fit">
            <Plus /> Add offer
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an offer</DialogTitle>
          <DialogDescription>You can fill in the discount and description right after.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Getaway Special" autoFocus />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={submitting || !title.trim()}>
            {submitting ? "Adding…" : "Add offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OffersSettings() {
  const { data, loading, reload } = useFetch<{ offers: Offer[] }>("/api/settings/offers");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Offers</CardTitle>
        </CardHeader>
      </Card>
      {loading || !data
        ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
        : data.offers.map((o) => <OfferCard key={o.id} offer={o} onChanged={reload} />)}
      {!loading && data?.offers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No offers yet — Anushka can&apos;t mention a promotion to guests until you add one.
        </p>
      )}
      <AddOfferDialog onAdded={reload} />
    </div>
  );
}
