"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroGlow } from "@/components/hero-glow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/motion/reveal";
import { TiltCard } from "@/components/motion/tilt-card";
import { apiFetch } from "@/lib/api-client";
import { adminLoginSchema, AdminLoginInput } from "@/lib/validation/admin";

export default function AdminLoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginInput>({ resolver: zodResolver(adminLoginSchema) });

  async function onSubmit(data: AdminLoginInput) {
    setSubmitting(true);
    try {
      await apiFetch("/api/admin/login", { method: "POST", body: JSON.stringify(data) });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden p-6">
      <HeroGlow intensity="low" />
      <div className="w-full max-w-sm">
        <Reveal>
          <div className="mb-8 flex items-center justify-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-[0_2px_14px_-2px_var(--primary)]">
              H
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">HotelOS Ultra — Admin</span>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <TiltCard>
            <Card variant="glass">
              <CardHeader>
                <CardTitle>Platform admin</CardTitle>
                <CardDescription>Manage every hotel on HotelOS Ultra.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" {...register("email")} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>
                  <Button type="submit" disabled={submitting} className="mt-2 h-9 w-full">
                    {submitting ? "Logging in…" : "Log in"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TiltCard>
        </Reveal>
      </div>
    </div>
  );
}
