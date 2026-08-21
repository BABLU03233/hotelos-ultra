/**
 * Default follow-up cadence from the spec: +1h reminder, +24h offer,
 * +3d weekend package, +7d last follow-up — then the last one repeats
 * every 24h indefinitely (repeatDaily) until the guest replies or the
 * lead is booked/closed. Seeded for every new tenant (self-service
 * register, and the seed script); fully editable afterwards in
 * Settings → Follow-ups.
 */
export const DEFAULT_FOLLOW_UP_RULES = [
  {
    order: 1,
    delayMinutes: 60,
    action: "REMINDER" as const,
    messageBody:
      // Deliberately claims nothing about what was already said.
      //
      // The old wording — "were you able to look at the room options I
      // shared?" — is the first message in the ladder, so it fires an hour
      // after ANY conversation goes quiet, including one where the guest only
      // said "hi" and no rooms were ever shared. Seen exactly that way in a
      // real chat. A nudge that describes something that did not happen reads
      // as a bot talking to itself, and it is the first thing the guest hears
      // after silence.
      "Hi! Just checking you got everything you needed 😊 Happy to help with rooms, dates or anything else — just say the word.",
  },
  {
    order: 2,
    delayMinutes: 60 * 24,
    action: "OFFER" as const,
    messageBody: "Still deciding? Ask me about our current offers — I can find something that fits your budget.",
  },
  {
    order: 3,
    delayMinutes: 60 * 24 * 3,
    action: "PACKAGE" as const,
    messageBody: "We have a great weekend package running right now — want me to share the details?",
  },
  {
    order: 4,
    delayMinutes: 60 * 24 * 7,
    action: "LAST" as const,
    messageBody: "Just wanted to check in again — whenever you're ready to book, we'd love to host you. Let us know anytime!",
    repeatDaily: true,
  },
];
