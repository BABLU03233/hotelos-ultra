import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Guards a bug that shipped three separate times.
 *
 * DialogContent's base classes ended with `sm:max-w-sm`. A caller writing
 * `max-w-lg` or `max-w-3xl` looks like it overrides that, and does not:
 * tailwind-merge treats a responsive variant and a bare utility as different
 * keys, keeps both, and the `sm:` rule wins above 640px. Five dialogs were
 * rendering 384px wide on a desktop — including a two-column template builder
 * that had a form and a live preview crushed side by side.
 *
 * A plain `max-w-sm` default caps at the same 384px, behaves identically on
 * mobile (w-[calc(100%-2rem)] is narrower than 384px on any phone), and is
 * actually replaced by a caller's max-w-*.
 */
describe("dialog default width", () => {
  const source = readFileSync(join(process.cwd(), "src/components/ui/dialog.tsx"), "utf8");

  it("does not set its default max-width behind a breakpoint", () => {
    // The specific shape that caused the bug. If this fails, callers passing
    // max-w-* are being silently ignored above 640px again.
    expect(source).not.toMatch(/\b(sm|md|lg|xl):max-w-/);
  });

  it("still constrains width by default", () => {
    expect(source).toMatch(/\bmax-w-sm\b/);
  });
});

describe("why that shape was a trap", () => {
  it("a bare default IS replaced by a caller's width", () => {
    expect(cn("max-w-sm", "max-w-lg")).toBe("max-w-lg");
  });

  it("a responsive default is NOT replaced — both survive, and the breakpoint wins", () => {
    // This is the whole bug, in one line.
    const result = cn("sm:max-w-sm", "max-w-lg");
    expect(result).toContain("sm:max-w-sm");
    expect(result).toContain("max-w-lg");
  });

  it("matching the breakpoint does override it", () => {
    expect(cn("sm:max-w-sm", "sm:max-w-lg")).toBe("sm:max-w-lg");
  });
});
