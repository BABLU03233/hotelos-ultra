const MAX_ROWS = 10; // WhatsApp Cloud API: max 10 rows total across all sections
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;

export interface OfferListMessage {
  type: "list";
  body: string;
  buttonText: string;
  sections: { rows: { id: string; title: string; description: string }[] }[];
}

/**
 * Builds the "Show me offers" List Message from real, active Offer rows —
 * reached only via the PRICE_OBJECTION "Show me offers" tap (never
 * AI-routed, see resolveStageKey), so the guest sees the tenant's actual
 * discount codes/terms, not a free-tier model's paraphrase of them.
 * Pure/DB-free so it's unit-testable; the caller does the actual Offer query.
 */
export function buildOfferListMessage(offers: { id: string; title: string; description: string | null; discount: string | null }[]): OfferListMessage {
  const rows = offers.slice(0, MAX_ROWS).map((o) => ({
    id: `offer_pick_${o.id}`,
    title: o.title.slice(0, ROW_TITLE_MAX),
    description: [o.discount, o.description].filter(Boolean).join(" — ").slice(0, ROW_DESCRIPTION_MAX),
  }));
  return {
    type: "list",
    body: "Here's what's running right now — tap one to learn more:",
    buttonText: "See offers",
    sections: [{ rows }],
  };
}
