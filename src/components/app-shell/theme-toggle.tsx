"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match device", icon: Monitor },
] as const;

/**
 * Light / dark / follow-the-device.
 *
 * The dark palette and several hundred `dark:` classes were already in the
 * codebase; what was missing was any way to reach them. next-themes was
 * configured with enableSystem={false} and no control rendered anywhere, so
 * every one of those classes was dead code and the app was light-only in
 * practice.
 *
 * Rendered from state only after mount. The server cannot know which theme the
 * browser resolved — the class is applied by a script before paint — so
 * rendering the active icon during SSR guarantees a hydration mismatch, and
 * next-themes' own docs call this out. The placeholder keeps the header from
 * shifting while that resolves.
 */
/**
 * "Has this hydrated yet", without an effect.
 *
 * The usual useState+useEffect version trips this repo's
 * react-hooks/set-state-in-effect rule, which errors on any synchronous
 * setState in an effect body. useSyncExternalStore answers the same question
 * by construction: the server snapshot is false, the client snapshot is true,
 * and nothing ever changes so the subscription is a no-op. Defined at module
 * scope so the references are stable and React never re-subscribes.
 */
const noopSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = React.useSyncExternalStore(noopSubscribe, onClient, onServer);

  if (!mounted) {
    return <Button variant="ghost" size="icon-sm" aria-hidden className="opacity-0" />;
  }

  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Change theme">
            <Icon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => setTheme(o.value)}>
            <o.icon className="size-4" />
            {o.label}
            <Check className={cn("ml-auto size-4", theme === o.value ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
