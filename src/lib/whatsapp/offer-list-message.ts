import { truncateRowTitle } from "./row-title";
import { GuestLanguage, resolveLanguage, t } from "@/lib/i18n/guest-language";

const MAX_ROWS = 10; // WhatsApp Cloud API: max 10 rows total across all sections
const ROW_DESCRIPTION_MAX = 72;

export interface OfferListMessage {
  type: "list";
  body: string;
  buttonText: string;
  sections: { rows: { id: string; title: string; description: string }[] }[];
}

/**
 * Offer titles conventionally carry their code in brackets — "10% Off First
 * Stay (WELCOME10)". At 30 characters that overflows WhatsApp's 24-char row
 * title and truncates mid-code to "10% Off First Stay (WELC", which reads as
 * a broken message and gives the guest half a coupon code.
 *
 * The bracketed code is stripped for the title and surfaced in the
 * description instead, which has three times the room. Nothing is lost — the
 * guest still sees the code, somewhere it actually fits.
 */
function splitTitleAndCode(title: string): { label: string; code: string | null } {
  const m = title.match(/^(.*?)\s*\(([A-Z0-9_-]{3,})\)\s*$/);
  return m ? { label: m[1].trim(), code: m[2] } : { label: title.trim(), code: null };
}

/**
 * Builds the "Show me offers" List Message from real, active Offer rows —
 * the guest sees the hotel's actual discounts and terms, not a free-tier
 * model's paraphrase of them. Pure/DB-free so it's unit-testable; the caller
 * does the Offer query.
 */
export function buildOfferListMessage(
  offers: { id: string; title: string; description: string | null; discount: string | null }[],
  lang?: GuestLanguage | null
): OfferListMessage {
  const s = t(resolveLanguage(lang));
  const rows = offers.slice(0, MAX_ROWS).map((o) => {
    const { label, code } = splitTitleAndCode(o.title);
    return {
      id: `offer_pick_${o.id}`,
      title: truncateRowTitle(label),
      description: [o.discount, code ? `code ${code}` : null, o.description].filter(Boolean).join(" — ").slice(0, ROW_DESCRIPTION_MAX),
    };
  });
  return {
    type: "list",
    body: s.offersBody,
    buttonText: s.offersButton,
    sections: [{ rows }],
  };
}
