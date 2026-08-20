"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api-client";
import { saveWithFeedback } from "@/lib/save-with-feedback";
import { useAuthStore } from "@/store/use-auth-store";
import { StaffMember } from "@/types";
import { toast } from "sonner";

export function StaffSettings() {
  const { data, loading, reload } = useFetch<{ staff: StaffMember[] }>("/api/settings/staff");
  const currentUser = useAuthStore((s) => s.user);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function addStaff() {
    setSubmitting(true);
    try {
      await apiFetch("/api/settings/staff", { method: "POST", body: JSON.stringify({ name, email, password, role: "STAFF" }) });
      setName("");
      setEmail("");
      setPassword("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add staff member");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateRole(id: string, role: "OWNER" | "STAFF") {
    // A permissions change. Failing quietly here means the owner believes
    // they granted or revoked Owner access and it never happened — which they
    // would only discover when someone can, or cannot, do something.
    const ok = await saveWithFeedback(
      () => apiFetch(`/api/settings/staff/${id}`, { method: "PATCH", body: JSON.stringify({ role }) }),
      "Couldn’t change that role"
    );
    if (!ok) return;
    reload();
  }

  async function remove(id: string) {
    await apiFetch(`/api/settings/staff/${id}`, { method: "DELETE" }).catch((err) => toast.error(err.message));
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="flex flex-col">
              {data.staff.map((member) => (
                <div key={member.id} className="flex items-center gap-2 border-b border-border py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <Select value={member.role} onValueChange={(v) => v && updateRole(member.id, v as "OWNER" | "STAFF")}>
                    <SelectTrigger className="w-28">
                      <SelectValue>{(v: string) => (v === "OWNER" ? "Owner" : "Staff")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OWNER">Owner</SelectItem>
                      <SelectItem value="STAFF">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                  {member.id !== currentUser?.id && (
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(member.id)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add staff member</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Temporary password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <Button onClick={addStaff} disabled={submitting || !name || !email || password.length < 8} className="w-fit">
            {submitting ? "Adding…" : "Add staff member"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
