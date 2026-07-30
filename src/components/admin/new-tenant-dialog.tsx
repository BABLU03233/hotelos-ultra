"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { apiFetch } from "@/lib/api-client";

export function NewTenantDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [hotelName, setHotelName] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch("/api/admin/tenants", {
        method: "POST",
        body: JSON.stringify({ hotelName, ownerName, ownerEmail, ownerPassword }),
      });
      setOpen(false);
      setHotelName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      onCreated();
      toast.success("Hotel onboarded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create hotel");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = hotelName.trim() && ownerName.trim() && ownerEmail.trim() && ownerPassword.length >= 8;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus /> Onboard hotel
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Onboard a new hotel</DialogTitle>
          <DialogDescription>Creates the workspace and its first owner login — same as self-service signup.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Hotel name</Label>
            <Input value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Owner name</Label>
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Owner email</Label>
            <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Temporary password</Label>
            <Input type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Creating…" : "Create hotel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
