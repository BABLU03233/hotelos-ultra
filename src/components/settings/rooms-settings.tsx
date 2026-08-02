"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { Room } from "@/types";

function RoomCard({ room, onChanged }: { room: Room; onChanged: () => void }) {
  const [form, setForm] = React.useState(room);

  async function save() {
    await apiFetch(`/api/settings/rooms/${room.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        description: form.description,
        price: Number(form.price),
        capacity: Number(form.capacity),
      }),
    });
    onChanged();
  }

  async function remove() {
    await apiFetch(`/api/settings/rooms/${room.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={save} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} onBlur={save} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Price / night (₹)</Label>
            <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} onBlur={save} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Sleeps</Label>
            <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} onBlur={save} />
          </div>
        </div>
        <Textarea
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          onBlur={save}
          placeholder="Description"
          className="min-h-14"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{formatMoney(form.price)} / night</p>
          <Button variant="ghost" size="icon-sm" onClick={remove}>
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RoomsSettings() {
  const { data, loading, reload } = useFetch<{ rooms: Room[] }>("/api/settings/rooms");

  async function addRoom() {
    await apiFetch("/api/settings/rooms", {
      method: "POST",
      body: JSON.stringify({ name: "New Room", type: "Standard", price: 2500, capacity: 2 }),
    });
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Room pricing</h2>
      {loading || !data
        ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
        : data.rooms.map((r) => <RoomCard key={r.id} room={r} onChanged={reload} />)}
      {!loading && data?.rooms.length === 0 && (
        <p className="text-sm text-muted-foreground">No rooms added yet — Anushka can&apos;t recommend one until you add at least one.</p>
      )}
      <Button variant="outline" onClick={addRoom} className="w-fit">
        <Plus /> Add room
      </Button>
    </div>
  );
}
