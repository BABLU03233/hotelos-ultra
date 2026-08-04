"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARY, GlossaryKey } from "@/lib/glossary";

/** Underlines a jargon word and shows its plain-language definition on hover/tap. */
export function GlossaryTerm({ term, children }: { term: GlossaryKey; children?: React.ReactNode }) {
  const entry = GLOSSARY[term];
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground underline-offset-2">
        {children ?? entry.term}
      </TooltipTrigger>
      <TooltipContent>{entry.definition}</TooltipContent>
    </Tooltip>
  );
}
