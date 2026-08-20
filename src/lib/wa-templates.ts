export type WaTemplateCategory = "WELCOME" | "BOOKING" | "CHECK_IN" | "OFFER" | "FOLLOW_UP" | "REVIEW";

export const WA_TEMPLATE_CATEGORY_LABELS: Record<WaTemplateCategory, string> = {
  WELCOME: "Welcome",
  BOOKING: "Booking",
  CHECK_IN: "Check-in",
  OFFER: "Offers",
  FOLLOW_UP: "Follow-up",
  REVIEW: "Reviews",
};

export interface WaTemplate {
  id: string;
  category: WaTemplateCategory;
  title: string;
  /** WhatsApp-ready copy with {{placeholders}} — swap these for real values before sending. */
  body: string;
  /**
   * Safe to broadcast to a list the guest is not currently talking to —
   * typically an imported contact list.
   *
   * The distinction is not cosmetic. A booking confirmation is a reply inside a
   * live conversation; a weekend offer is an unsolicited marketing message to
   * someone who may not remember the hotel. Only the second kind needs an
   * opt-out line, and only the second kind can cost the platform its WhatsApp
   * quality rating when it lands badly.
   */
  bulkSafe: boolean;
}

/**
 * Ready-to-send WhatsApp copy for the hotel use cases every property needs on
 * day one. Shared by the public site's template showcase and the in-app
 * library (Templates nav item + "Insert template" pickers in campaigns and
 * follow-up steps) so the two stay identical.
 *
 * Every `bulkSafe` template here must pass the campaign reviewer's own
 * deterministic checks — see wa-templates.test.ts, which asserts exactly that.
 * Shipping promotional starter copy that our own review would flag is worse
 * than shipping none: it is the app teaching hotels the habits it then
 * penalises them for. The offer templates originally failed that test (no
 * opt-out line, "Exclusive for you", "grab it") and were rewritten.
 */
export const WA_TEMPLATES: WaTemplate[] = [
  {
    id: "welcome-concierge",
    category: "WELCOME",
    title: "Concierge greeting",
    body: "Welcome to {{hotel_name}}, {{guest_name}}! 👋 I'm {{agent_name}}, your WhatsApp concierge — ask me about rooms, pricing, or anything else. I'm here 24/7, and our team jumps in whenever you need a human.",
    bulkSafe: false,
  },
  {
    id: "booking-confirmed",
    category: "BOOKING",
    title: "Booking confirmed",
    body: "Hi {{guest_name}}, your booking at {{hotel_name}} is confirmed 🎉\n\n{{room_type}} · {{check_in_date}} – {{check_out_date}}\n\nReply here anytime before you arrive if you need anything.",
    bulkSafe: false,
  },
  {
    id: "checkin-reminder",
    category: "CHECK_IN",
    title: "Check-in reminder",
    body: "Hi {{guest_name}}, just a friendly reminder — your check-in at {{hotel_name}} is tomorrow from {{check_in_time}}. Let us know your approximate arrival time and we'll have everything ready.",
    bulkSafe: false,
  },
  {
    id: "late-checkout",
    category: "CHECK_IN",
    title: "Late checkout upsell",
    body: "Hi {{guest_name}}, would you like to extend your stay with a late checkout until {{late_checkout_time}} for {{late_checkout_fee}}? Reply YES and we'll block it for you.",
    bulkSafe: false,
  },
  {
    id: "weekend-offer",
    category: "OFFER",
    title: "Weekend offer broadcast",
    // Rewritten from "🌟 Exclusive for you… reply BOOK to grab it." A real
    // date replaces the old invented urgency, and the offer is stated plainly
    // rather than sold.
    body: "Hi {{guest_name}}, we have {{discount}} off a {{room_type}} at {{hotel_name}} this weekend, breakfast included. It's on until {{offer_end_date}} — reply BOOK if you'd like it held.\n\nReply STOP to opt out.",
    bulkSafe: true,
  },
  {
    id: "returning-guest",
    category: "OFFER",
    title: "Returning-guest offer",
    body: "It's been a while, {{guest_name}}! Come back to {{hotel_name}} and enjoy {{discount}} off as a returning guest — we'd love to host you again.\n\nReply STOP to opt out.",
    bulkSafe: true,
  },
  {
    id: "quiet-midweek",
    category: "OFFER",
    title: "Midweek rate (imported list)",
    // Written for the case the product is actually used for: a list of old
    // numbers who have not heard from this hotel in months. It says who is
    // messaging and why in the first line, because most recipients will not
    // recognise the number.
    body: "Hi {{guest_name}}, this is {{hotel_name}} in {{hotel_city}} — you've stayed with us before. Midweek rooms are quieter and cheaper right now at {{discount}} off. Reply here if you'd like dates checked.\n\nReply STOP to opt out.",
    bulkSafe: true,
  },
  {
    id: "festive-season",
    category: "OFFER",
    title: "Festive season rooms",
    body: "Hi {{guest_name}}, {{hotel_name}} still has rooms open for {{festival_name}}. Happy to hold one for you if you're planning to travel — just reply with your dates.\n\nReply STOP to opt out.",
    bulkSafe: true,
  },
  {
    id: "gentle-followup",
    category: "FOLLOW_UP",
    title: "Gentle follow-up",
    body: "Hi {{guest_name}}, just checking in — are you still looking to book with {{hotel_name}}? Happy to answer any questions about rooms, pricing, or availability.",
    bulkSafe: false,
  },
  {
    id: "review-request",
    category: "REVIEW",
    title: "Post-stay review request",
    body: "Thank you for staying with us at {{hotel_name}}, {{guest_name}}! We'd love to hear about your experience — could you spare 30 seconds to leave us a review? {{review_link}}",
    bulkSafe: false,
  },
];
