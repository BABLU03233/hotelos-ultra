/**
 * Default follow-up cadence from the spec: +1h reminder, +24h offer,
 * +3d weekend package, +7d last follow-up. Seeded for every new tenant
 * (self-service register, and the seed script); fully editable afterwards
 * in Settings → Follow-ups.
 */
export const DEFAULT_FOLLOW_UP_RULES = [
  {
    order: 1,
    delayMinutes: 60,
    action: "REMINDER" as const,
    messageBody:
      "Hi! Just checking in — were you able to look at the room options I shared? Happy to answer any questions.",
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
    messageBody:
      "Just following up one last time — whenever you're ready to book, we'd love to host you. Let us know!",
  },
];
