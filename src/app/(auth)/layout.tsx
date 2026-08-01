import { Reveal } from "@/components/motion/reveal";
import { TiltCard } from "@/components/motion/tilt-card";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Reveal>
          <div className="mb-8 flex items-center justify-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-[0_2px_14px_-2px_var(--primary)]">
              H
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">HotelOS Ultra</span>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <TiltCard>{children}</TiltCard>
        </Reveal>
      </div>
    </div>
  );
}
