import { ImageIcon } from "lucide-react";
import { BodyVariableSlot, exampleValueForSlot } from "@/lib/whatsapp/template-variables";

/** Resolves {{1}}, {{2}}... in order against the slot list's example values, for preview purposes only. */
function resolvePlaceholders(text: string, slots: BodyVariableSlot[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_match, indexStr) => {
    const slot = slots[Number(indexStr) - 1];
    return slot ? exampleValueForSlot(slot) : `{{${indexStr}}}`;
  });
}

export function WhatsAppBubblePreview({
  headerText,
  hasImageHeader,
  bodyText,
  bodyVariableSlots,
  footerText,
  buttons,
}: {
  headerText?: string;
  hasImageHeader?: boolean;
  bodyText: string;
  bodyVariableSlots: BodyVariableSlot[];
  footerText?: string | null;
  buttons: { type: string; text: string }[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl rounded-tl-sm bg-[#dcf8c6] p-3 text-[13px] leading-relaxed text-[#111b21] dark:bg-[#025144] dark:text-[#e9edef]">
      {hasImageHeader && (
        <div className="flex h-28 items-center justify-center rounded-lg bg-black/10 text-[#111b21]/50 dark:bg-white/10 dark:text-[#e9edef]/50">
          <ImageIcon className="size-6" />
        </div>
      )}
      {headerText && <p className="font-semibold">{headerText}</p>}
      <p className="whitespace-pre-line">{resolvePlaceholders(bodyText, bodyVariableSlots) || "Your message body…"}</p>
      {footerText && <p className="text-[11px] opacity-70">{footerText}</p>}
      {buttons.length > 0 && (
        <div className="-mx-3 -mb-3 mt-1 flex flex-col divide-y divide-black/10 border-t border-black/10 dark:divide-white/10 dark:border-white/10">
          {buttons.map((b, i) => (
            <span key={i} className="px-3 py-2 text-center text-[13px] font-medium text-[#00a5f4]">
              {b.text || "Button"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
