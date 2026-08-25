"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useAuthStore } from "@/store/use-auth-store";

export function AccountSettings() {
  const isOwner = useAuthStore((s) => s.user?.role === "OWNER");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Changes your own login — doesn&apos;t affect other staff.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Current password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <Button
            onClick={changePassword}
            disabled={saving || !currentPassword || newPassword.length < 8}
            className="w-fit"
          >
            {saving ? "Saving…" : "Change password"}
          </Button>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
            <CardDescription>Clears test data so a fresh campaign starts with a clean slate.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResetChatsDialog />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResetChatsDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [resetting, setResetting] = React.useState(false);

  async function resetChats() {
    setResetting(true);
    try {
      const result = await apiFetch<{ campaignsDeleted: number; contactsDeleted: number }>("/api/settings/reset-chats", {
        method: "POST",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      toast.success(`Deleted ${result.contactsDeleted} contact${result.contactsDeleted === 1 ? "" : "s"} and ${result.campaignsDeleted} campaign${result.campaignsDeleted === 1 ? "" : "s"}`);
      setOpen(false);
      setConfirmText("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't clear contacts");
    } finally {
      setResetting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (setOpen(v), v || setConfirmText(""))}>
      <DialogTrigger render={<Button variant="destructive">Delete all contacts &amp; chat history</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete every contact and chat?</DialogTitle>
          <DialogDescription>
            This permanently deletes every contact, their WhatsApp message history, bookings, and every campaign
            for this hotel. Other hotels on the platform are never touched. There is no undo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label>Type DELETE to confirm</Label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoComplete="off" />
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={confirmText !== "DELETE" || resetting} onClick={resetChats}>
            {resetting ? "Deleting…" : "Delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
