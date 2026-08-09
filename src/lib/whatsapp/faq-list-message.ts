const MAX_ROWS = 10; // WhatsApp Cloud API: max 10 rows total across all sections
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;

export interface FaqListMessage {
  type: "list";
  body: string;
  buttonText: string;
  sections: { rows: { id: string; title: string; description: string }[] }[];
}

/**
 * Builds the "Ask a question" List Message from real Faq rows — a guest
 * taps a question and gets the tenant's actual stored answer next (see
 * handle-inbound-message.ts's faq_pick_ handler), never a free-tier model's
 * own attempt at the answer. Row title is the question (a full sentence,
 * so 24 chars usually truncates it) and description is the answer, not the
 * question again, so a truncated title still previews the real answer —
 * the guest gets the untruncated answer the instant they tap either way.
 * Pure/DB-free so it's unit-testable; the caller does the actual Faq query.
 */
export function buildFaqListMessage(faqs: { id: string; question: string; answer: string }[]): FaqListMessage {
  const rows = faqs.slice(0, MAX_ROWS).map((f) => ({
    id: `faq_pick_${f.id}`,
    title: f.question.slice(0, ROW_TITLE_MAX),
    description: f.answer.slice(0, ROW_DESCRIPTION_MAX),
  }));
  return {
    type: "list",
    body: "Here are some things guests often ask — tap one:",
    buttonText: "See questions",
    sections: [{ rows }],
  };
}
