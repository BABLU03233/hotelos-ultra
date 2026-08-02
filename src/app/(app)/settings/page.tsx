import { Reveal } from "@/components/motion/reveal";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything Aria and your team need to know about the hotel.</p>
        </div>
      </Reveal>

      <SettingsTabs initialTab={tab} />
    </div>
  );
}
