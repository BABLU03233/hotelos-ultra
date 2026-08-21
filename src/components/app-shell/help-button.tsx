"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reopens the welcome tour.
 *
 * The tour shows itself once and then never again, so an owner who skipped it
 * — or wants a reminder of what a section does weeks later — needs a way back
 * in. A window event rather than shared state: the header and the tour are in
 * different parts of the tree, and this avoids threading a store through the
 * server-component layout between them.
 */
export function HelpButton() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Take the tour"
      title="Take the tour"
      onClick={() => window.dispatchEvent(new Event("hotelos:open-tour"))}
    >
      <HelpCircle className="size-4" />
    </Button>
  );
}
