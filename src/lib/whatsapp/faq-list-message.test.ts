import { describe, expect, it } from "vitest";
import { buildFaqListMessage } from "./faq-list-message";

const FAQS = [
  { id: "f1", question: "What time is check-in and check-out?", answer: "Check-in is from 12:00 PM and check-out is by 11:00 AM." },
  { id: "f2", question: "Is parking available?", answer: "Yes, we have free covered parking on-site for guests." },
];

describe("buildFaqListMessage", () => {
  it("builds one row per FAQ with id/title/description", () => {
    const msg = buildFaqListMessage(FAQS);
    expect(msg.type).toBe("list");
    expect(msg.sections).toHaveLength(1);
    expect(msg.sections[0].rows).toEqual([
      { id: "faq_pick_f1", title: "What time is check-in…", description: "Check-in is from 12:00 PM and check-out is by 11:00 AM." },
      { id: "faq_pick_f2", title: "Is parking available?", description: "Yes, we have free covered parking on-site for guests." },
    ]);
  });

  it("caps at 10 rows even if a tenant has more FAQs (WhatsApp's hard limit)", () => {
    const manyFaqs = Array.from({ length: 15 }, (_, i) => ({ id: `f${i}`, question: `Question ${i}?`, answer: `Answer ${i}.` }));
    const msg = buildFaqListMessage(manyFaqs);
    expect(msg.sections[0].rows).toHaveLength(10);
  });

  it("truncates a long question to WhatsApp's 24-char row title limit", () => {
    const msg = buildFaqListMessage([{ id: "f1", question: "Do you offer discounts for direct bookings made through WhatsApp?", answer: "Yes." }]);
    expect(msg.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
  });

  it("truncates a long answer to WhatsApp's 72-char row description limit, without re-showing the question", () => {
    const longAnswer =
      "Cancellation and change terms are confirmed with our front desk at the time of booking — message us on WhatsApp before booking if you'd like the details.";
    const msg = buildFaqListMessage([{ id: "f1", question: "Can I cancel or change my booking?", answer: longAnswer }]);
    expect(msg.sections[0].rows[0].description.length).toBeLessThanOrEqual(72);
    expect(msg.sections[0].rows[0].description).toBe(longAnswer.slice(0, 72));
  });

  it("handles an empty FAQ list without throwing", () => {
    const msg = buildFaqListMessage([]);
    expect(msg.sections[0].rows).toEqual([]);
  });
});
