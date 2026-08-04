"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WA_TEMPLATE_CATEGORY_LABELS, WaTemplate } from "@/lib/wa-templates";

export function TemplateCard({ template, onUse }: { template: WaTemplate; onUse?: (body: string) => void }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(template.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Badge variant="outline">{WA_TEMPLATE_CATEGORY_LABELS[template.category]}</Badge>
            <Badge variant="secondary">Starter draft</Badge>
          </div>
          <p className="text-sm font-medium">{template.title}</p>
        </div>

        <div className="relative rounded-2xl rounded-tl-sm bg-[#dcf8c6] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line text-[#111b21] dark:bg-[#025144] dark:text-[#e9edef]">
          {template.body}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
          {onUse && (
            <Button size="sm" className="flex-1" onClick={() => onUse(template.body)}>
              Use this
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
