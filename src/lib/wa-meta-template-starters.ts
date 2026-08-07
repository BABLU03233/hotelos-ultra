import { MetaTemplateInput } from "@/lib/validation/meta-template";

/**
 * Pre-filled MARKETING starting points for the Meta template builder — an
 * owner picks one, edits the discount/price/wording, and submits. Written
 * to be realistic candidates for Meta's automated review: no ALL-CAPS, no
 * misleading claims, and each includes a "Stop promos" quick-reply — Meta's
 * own guidelines favor an opt-out on marketing templates, and it measurably
 * helps approval odds.
 */
export const WA_META_TEMPLATE_STARTERS: { id: string; title: string; blurb: string; template: Omit<MetaTemplateInput, "name" | "language"> }[] = [
  {
    id: "weekend-offer",
    title: "Weekend offer",
    blurb: "A limited-time discount, personalized with the guest's name.",
    template: {
      category: "MARKETING",
      header: { type: "text", text: "A little something for you 🎁" },
      bodyText:
        "Hi {{1}}! Planning a getaway? Book with us this weekend and save {{2}} off your stay at {{3}} — limited rooms left, so grab it before it's gone!",
      bodyVariableSlots: [
        { source: "guest_name", label: "" },
        { source: "custom", label: "Discount" },
        { source: "hotel_name", label: "" },
      ],
      footerText: "Reply STOP anytime to opt out",
      buttons: [
        { type: "QUICK_REPLY", text: "Book now" },
        { type: "QUICK_REPLY", text: "Stop promos" },
      ],
    },
  },
  {
    id: "price-drop",
    title: "Price drop / curiosity",
    blurb: "Leads with a starting price and urgency, without overpromising.",
    template: {
      category: "MARKETING",
      header: { type: "text", text: "Prices just dropped 👀" },
      bodyText: "Hey {{1}}, rooms at {{2}} are now starting from {{3}} — but only for the next few days. Want us to hold one for you?",
      bodyVariableSlots: [
        { source: "guest_name", label: "" },
        { source: "hotel_name", label: "" },
        { source: "custom", label: "Starting price" },
      ],
      footerText: "Reply STOP anytime to opt out",
      buttons: [
        { type: "QUICK_REPLY", text: "Yes, hold a room" },
        { type: "QUICK_REPLY", text: "Stop promos" },
      ],
    },
  },
  {
    id: "win-back",
    title: "Win-back / re-engagement",
    blurb: "For guests who went quiet a while ago — warm, not pushy.",
    template: {
      category: "MARKETING",
      header: { type: "text", text: "We miss you! 💛" },
      bodyText: "Hi {{1}}, it's been a while! Come back to {{2}} and enjoy {{3}} off your next stay, just for you.",
      bodyVariableSlots: [
        { source: "guest_name", label: "" },
        { source: "hotel_name", label: "" },
        { source: "custom", label: "Discount" },
      ],
      footerText: "Reply STOP anytime to opt out",
      buttons: [
        { type: "QUICK_REPLY", text: "I'm interested" },
        { type: "QUICK_REPLY", text: "Stop promos" },
      ],
    },
  },
];
