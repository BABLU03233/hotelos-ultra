/** Plain-language definitions for WhatsApp/Meta jargon that shows up in Settings, Follow-ups, and Campaigns. Consumed by <GlossaryTerm>. */
export const GLOSSARY = {
  "meta-app": {
    term: "Meta App",
    definition: "A free developer project you create at developers.facebook.com — it's what lets your hotel's WhatsApp number talk to this dashboard.",
  },
  waba: {
    term: "WhatsApp Business Account",
    definition: "Meta's ID for your hotel's WhatsApp number itself, separate from the Meta App that connects to it.",
  },
  webhook: {
    term: "webhook",
    definition: "A URL Meta sends incoming guest messages to. You paste this app's URL into Meta's dashboard so messages actually reach Anushka.",
  },
  "system-user": {
    term: "System User",
    definition: "A Meta Business Manager account made for apps (not a person) — tokens generated for one don't expire after 24 hours like the quick-setup ones do.",
  },
  token: {
    term: "access token",
    definition: "A password-like key that lets this app send/receive WhatsApp messages on your hotel's behalf. The quick one from API Setup expires in ~24h; a System User token doesn't.",
  },
  "24h-window": {
    term: "24-hour window",
    definition: "WhatsApp only lets you send a free-form reply within 24 hours of the guest's last message. After that, only a Meta-approved template message can reach them.",
  },
  "approved-template": {
    term: "Meta-approved template",
    definition: "A message format you submit to Meta ahead of time and get approved — different from the starter drafts in this app's Templates tab. Required to message a guest outside the 24-hour window.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
