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
}

/**
 * Ready-to-send WhatsApp copy for the hotel use cases every property needs on
 * day one. Shared by the public site's template showcase and the in-app
 * library (Templates nav item + "Insert template" pickers in campaigns and
 * follow-up steps) so the two stay identical.
 */
export const WA_TEMPLATES: WaTemplate[] = [
  {
    id: "welcome-concierge",
    category: "WELCOME",
    title: "Concierge greeting",
    body: "Welcome to {{hotel_name}}, {{guest_name}}! 👋 I'm Aria, your WhatsApp concierge — ask me about rooms, pricing, or anything else. I'm here 24/7, and our team jumps in whenever you need a human.",
  },
  {
    id: "booking-confirmed",
    category: "BOOKING",
    title: "Booking confirmed",
    body: "Hi {{guest_name}}, your booking at {{hotel_name}} is confirmed 🎉\n\n{{room_type}} · {{check_in_date}} – {{check_out_date}}\n\nReply here anytime before you arrive if you need anything.",
  },
  {
    id: "checkin-reminder",
    category: "CHECK_IN",
    title: "Check-in reminder",
    body: "Hi {{guest_name}}, just a friendly reminder — your check-in at {{hotel_name}} is tomorrow from {{check_in_time}}. Let us know your approximate arrival time and we'll have everything ready.",
  },
  {
    id: "late-checkout",
    category: "CHECK_IN",
    title: "Late checkout upsell",
    body: "Hi {{guest_name}}, would you like to extend your stay with a late checkout until {{late_checkout_time}} for {{late_checkout_fee}}? Reply YES and we'll block it for you.",
  },
  {
    id: "weekend-offer",
    category: "OFFER",
    title: "Weekend offer broadcast",
    body: "🌟 Exclusive for you, {{guest_name}}! Book a {{room_type}} this weekend and get {{discount}} off, breakfast included. Valid till {{offer_end_date}} — reply BOOK to grab it.",
  },
  {
    id: "returning-guest",
    category: "OFFER",
    title: "Returning-guest offer",
    body: "It's been a while, {{guest_name}}! Come back to {{hotel_name}} and enjoy {{discount}} off as a returning guest — we'd love to host you again.",
  },
  {
    id: "gentle-followup",
    category: "FOLLOW_UP",
    title: "Gentle follow-up",
    body: "Hi {{guest_name}}, just checking in — are you still looking to book with {{hotel_name}}? Happy to answer any questions about rooms, pricing, or availability.",
  },
  {
    id: "review-request",
    category: "REVIEW",
    title: "Post-stay review request",
    body: "Thank you for staying with us at {{hotel_name}}, {{guest_name}}! We'd love to hear about your experience — could you spare 30 seconds to leave us a review? {{review_link}}",
  },
];
