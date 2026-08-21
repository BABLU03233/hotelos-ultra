import { MetaTemplateInput } from "@/lib/validation/meta-template";

/**
 * Pre-filled MARKETING starting points for the Meta template builder — an
 * owner picks one, edits the discount/price/wording, and submits. Written
 * to be realistic candidates for Meta's automated review: no ALL-CAPS, no
 * misleading claims, and each includes a "Stop promos" quick-reply — Meta's
 * own guidelines favor an opt-out on marketing templates, and it measurably
 * helps approval odds.
 *
 * `readyToUse` marks the ones with NO custom variables — every placeholder
 * fills itself from the guest and hotel records, so the owner picks it, names
 * it, submits, and never touches it again. That distinction is the whole
 * point: the flexible starters all ask for a discount at campaign time, and
 * an owner who just wants to send "20% off" to a cold list should not have to
 * design a template to do it.
 *
 * Header text is deliberately plain: Meta rejects a template outright if its
 * TEXT header contains an emoji, a newline, an asterisk, or any formatting —
 * that goes in the body, which allows all of them. Every starter header here
 * is plain words for exactly that reason.
 *
 * Ready-to-use ones also read correctly for a contact with no name on file,
 * which is most of a cold import — buildTemplateComponents falls back to
 * "there", so "Hi {{1}}!" becomes "Hi there!" rather than "Hi !".
 */
export const WA_META_TEMPLATE_STARTERS: {
  id: string;
  title: string;
  blurb: string;
  readyToUse?: boolean;
  template: Omit<MetaTemplateInput, "name" | "language">;
}[] = [
  {
    id: "offer-20-ready",
    title: "20% off — ready to send",
    blurb: "Nothing to fill in. Name it, submit it, send it.",
    readyToUse: true,
    template: {
      category: "MARKETING",
      header: { type: "text", text: "20% off your next stay" },
      bodyText:
        "Hi {{1}}, this is {{2}}. We're offering 20% off room bookings made this week. Rooms start at ₹999 a night, breakfast included. Reply BOOK and we'll hold one for you. 🎁",
      bodyVariableSlots: [
        { source: "guest_name", label: "" },
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
    id: "first-stay-ready",
    title: "First stay — 15% off",
    blurb: "Introduces the hotel by name. Best for cold contacts.",
    readyToUse: true,
    template: {
      category: "MARKETING",
      // Someone on a cold list may not know who this is, and Meta expects a
      // marketing message to identify the business plainly. The hotel name
      // is in the first sentence rather than buried at the end.
      header: { type: "text", text: "A warm welcome from us" },
      bodyText:
        "Hi {{1}}, this is {{2}}. If you haven't stayed with us yet, here's 15% off your first booking — comfortable rooms, breakfast included, and a team that looks after you. Reply BOOK to check dates.",
      bodyVariableSlots: [
        { source: "guest_name", label: "" },
        { source: "hotel_name", label: "" },
      ],
      footerText: "Reply STOP anytime to opt out",
      buttons: [
        { type: "QUICK_REPLY", text: "Check dates" },
        { type: "QUICK_REPLY", text: "Stop promos" },
      ],
    },
  },
  {
    id: "festive-ready",
    title: "Festive offer — 25% off",
    blurb: "Seasonal push, nothing to fill in.",
    readyToUse: true,
    template: {
      category: "MARKETING",
      header: { type: "text", text: "Festive season offer" },
      bodyText:
        "Hi {{1}}, the festive season is here and {{2}} is offering 25% off stays booked this month. Rooms are filling up — reply BOOK and we'll check availability for your dates.",
      bodyVariableSlots: [
        { source: "guest_name", label: "" },
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
    id: "weekend-offer",
    title: "Weekend offer",
    blurb: "A limited-time discount, personalized with the guest's name.",
    template: {
      category: "MARKETING",
      header: { type: "text", text: "A little something for you" },
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
      header: { type: "text", text: "Prices just dropped" },
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
      header: { type: "text", text: "We miss you" },
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
