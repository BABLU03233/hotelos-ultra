import { cn } from "@/lib/utils";

/**
 * A single, disciplined gradient moment for hero contexts — deliberately NOT
 * a multi-element ambient background (see the deleted gradient-mesh.tsx):
 * one div, one background property with two radial-gradient layers baked-in
 * transparent falloff. Nothing to forget to extend if a layer is ever added.
 * Render inside a `relative overflow-hidden` container on hero routes only —
 * never in the root layout, so it structurally can't reach the dashboard.
 */
export function HeroGlow({ intensity = "high" }: { intensity?: "high" | "low" }) {
  const primaryOpacity = intensity === "high" ? 0.18 : 0.11;
  const secondaryOpacity = intensity === "high" ? 0.1 : 0.06;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]",
        intensity === "high" && "hero-glow-drift"
      )}
      style={{
        background: `radial-gradient(ellipse 60% 50% at 50% -10%, color-mix(in oklch, var(--primary), transparent ${100 - primaryOpacity * 100}%), transparent 70%),
          radial-gradient(ellipse 45% 40% at 65% 0%, color-mix(in oklch, var(--color-chart-3), transparent ${100 - secondaryOpacity * 100}%), transparent 70%)`,
      }}
    />
  );
}
