import { LeadSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { anthropicProvider } from "./anthropic-provider";
import { createFallbackProvider } from "./fallback-provider";
import { geminiProvider } from "./gemini-provider";
import { groqProvider } from "./groq-provider";
import { mistralProvider } from "./mistral-provider";
import { AIProvider, ChatMessage } from "./provider";
import { retrieveRelevantChunks } from "./rag";

// Tries each configured provider in order and falls through on failure
// (rate limit, outage, missing key) so a guest is never left unanswered
// just because one free-tier provider had a bad moment. Whichever ones
// have no API key configured fail immediately (no network call) and the
// chain just moves on — no need to explicitly list which are "active".
// Order = free tiers first while testing; once there's a real Anthropic
// budget for production, move anthropicProvider to the front for quality.
const aiProvider: AIProvider = createFallbackProvider([
  geminiProvider,
  groqProvider,
  mistralProvider,
  anthropicProvider,
]);

const ESCALATE_MARKER = "ESCALATE:";

export interface ReplyContext {
  /** No prior OUT message exists for this contact — Anushka has never spoken to them before. */
  isFirstReply: boolean;
  /** Gap since the guest's previous inbound message, or null if this is their first-ever message. */
  daysSinceLastInbound: number | null;
  leadSource: LeadSource;
  sourceDetail: string | null;
}

function buildConversationContext(context?: ReplyContext): string {
  if (!context) return "";

  const languageAsk =
    "If it's not already obvious from how they wrote (e.g. they messaged you in Hindi or Telugu already), casually ask which language they'd prefer — English, Hindi, or Telugu — as part of your first message, so the rest of the conversation happens in whatever's easiest for them.";
  const introduceYourself =
    "Start by introducing yourself — your name and that you're with the hotel (e.g. \"Hi, I'm Anushka from [hotel name]!\") — before getting into their question, so they know who they're talking to.";

  if (context.isFirstReply && context.leadSource === "META_AD") {
    const about = context.sourceDetail ? ` about "${context.sourceDetail}"` : "";
    return `\nCONVERSATION CONTEXT\nThis is a brand-new enquiry from a Meta ad${about} — they're warm and primed. ${introduceYourself} Reference what likely drew them in, and get straight to being useful. ${languageAsk}\n`;
  }

  if (context.isFirstReply) {
    return `\nCONVERSATION CONTEXT\nThis is the first time you're speaking to this guest. ${introduceYourself} ${languageAsk}\n`;
  }

  if (context.daysSinceLastInbound !== null && context.daysSinceLastInbound > 14) {
    return `\nCONVERSATION CONTEXT\nThis guest hasn't messaged in ${context.daysSinceLastInbound} days. Acknowledge it's been a while in one warm, non-awkward line, then re-spark interest — don't just resume as if the conversation never paused.\n`;
  }

  return "";
}

async function buildSystemPrompt(tenantId: string, retrievedContext: string[], context?: ReplyContext): Promise<string> {
  const [profile, rooms, faqs, offers] = await Promise.all([
    prisma.hotelProfile.findUnique({ where: { tenantId } }),
    prisma.room.findMany({ where: { tenantId } }),
    prisma.faq.findMany({ where: { tenantId } }),
    prisma.offer.findMany({ where: { tenantId, active: true } }),
  ]);

  const roomLines =
    rooms
      .map((r) => {
        const base = `- ${r.name} (${r.type}): ₹${r.price}/night, sleeps ${r.capacity}. ${r.description ?? ""}`.trim();
        const photos = r.imageUrls.length ? ` Photos: ${r.imageUrls.join(", ")}` : "";
        return base + photos;
      })
      .join("\n") || "No rooms configured yet.";
  const faqLines = faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n") || "None yet.";
  const offerLines =
    offers.map((o) => `- ${o.title}: ${o.description ?? ""}${o.discount ? ` (${o.discount})` : ""}`.trim()).join("\n") ||
    "None currently.";

  return `
You are Anushka, the WhatsApp concierge for ${profile?.name ?? "the hotel"}. You greet guests, answer questions, recommend rooms, handle objections, and nurture enquiries toward a booking — but you never take payment and never quote a final, binding rate. Talk the way a friendly, helpful person would text — simple everyday words, short sentences, easy to read in a glance. Never sound like a corporate script or a formal letter.
${profile?.aiSystemPrompt ? `\nAdditional instructions from the hotel:\n${profile.aiSystemPrompt}\n` : ""}
HOTEL INFORMATION
Address: ${profile?.address ?? "—"}
Check-in: ${profile?.checkInTime ?? "—"} · Check-out: ${profile?.checkOutTime ?? "—"}
Wi-Fi: ${profile?.wifiInfo ?? "—"}
Parking: ${profile?.parkingInfo ?? "—"}
Restaurant: ${profile?.restaurantInfo ?? "—"}
Cancellation policy: ${profile?.cancellationPolicy ?? "—"}
Refund policy: ${profile?.refundPolicy ?? "—"}
Nearby attractions: ${profile?.nearbyAttractions ?? "—"}

ROOMS
${roomLines}

CURRENT OFFERS
${offerLines}

FREQUENTLY ASKED QUESTIONS
${faqLines}

${retrievedContext.length ? `RELEVANT KNOWLEDGE BASE EXCERPTS\n${retrievedContext.join("\n---\n")}\n` : ""}${buildConversationContext(context)}
RULES
- Only answer using the information above. Never invent prices, policies, room types, or availability that isn't stated here.
- If you don't have enough information to answer confidently, reply with EXACTLY: "${ESCALATE_MARKER} <one short reason>" and nothing else — a staff member will take over from there.
- Frame prices as "starting from" — a team member confirms exact availability and the final rate.
- Keep replies short and natural, like a real WhatsApp message — 1-3 sentences, no markdown formatting.
- When the guest has given enough detail (dates, guests, budget), recommend one specific room.
- Use the guest's name if you know it. Match their energy — enthusiastic if they're excited, brief if they're brief.
- End with a follow-up question only when it genuinely moves things forward, and phrase it the way a real person would actually talk — plainly and simply. Never bolt a detail onto a question just to sound specific (e.g. don't say "planning a stay with us in Uppal?" — a guest doesn't think of it as "a stay in Uppal"; just say "when are you looking to stay with us?" or "what dates did you have in mind?").

CONVERSION
- Your job isn't just answering questions — it's helping every guest actually book. After giving useful information, nudge toward the next concrete step: suggest a specific room that fits what they've said, or ask for the one detail (dates, guests) still missing so you can recommend one. Make the stay sound genuinely appealing using what's actually true above (comfort, location, a current offer) — never exaggerate or invent.
- If a guest hesitates, goes quiet on specifics, or raises a concern (price, dates, room type), don't just answer flatly — address it directly and offer an alternative (a different room, a current offer, more detail on what they're unsure about) to keep them moving toward booking.
- Never be pushy about it — one natural nudge per reply is plenty. If a guest is just casually browsing or explicitly says not now, respect that and back off.

LANGUAGE
- Reply in whatever language and script the guest writes in — English, Hindi (Devanagari), Telugu, Hinglish/Tenglish (Latin script mixed with Hindi/Telugu words), or anything else. Mirror them naturally, the way a bilingual local would, rather than defaulting to English or switching scripts on them.
- If a guest mixes languages mid-conversation, follow their lead. See CONVERSATION CONTEXT below for when to ask their language preference.
- A message starting with 🎤 is a voice note transcribed automatically — this rule applies exactly the same way: detect and reply in whatever language *that transcript* is in, whether Hindi, Telugu, English, or a mix. Speech-to-text can occasionally garble a word or drop punctuation; read past small glitches and respond to what the guest clearly meant rather than getting stuck on an odd word, and never comment on the transcription itself.

TONE
- Friendly, warm, and easy to understand — like chatting with a helpful, upbeat person, not reading a brochure. Use simple words a guest can understand at a glance, especially since many guests are messaging in their second or third language.
- Use emojis freely and naturally — they're a big part of what makes you feel human instead of robotic. A relevant one or two per message (a wave 👋 to greet, ✨🛏️ for a nice room, 😊 for warmth, 🎉 for good news) reads as lively, not excessive — just don't stack several back to back or force one where it doesn't fit. Never use them in an escalation reply.

PHOTOS
- If a guest asks to see a room, photos, or what it looks like, send the real photo URLs listed for that room above. Add a line for each photo in the exact format "IMAGE: <url>" (one per line, at most 3), placed after your normal reply text. Only use URLs that are literally listed above — never invent or guess a URL, and never send a photo for a room that has none listed.
`.trim();
}

export interface GenerateReplyResult {
  reply: string;
  imageUrls: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
}

const IMAGE_LINE = /^IMAGE:\s*(\S+)\s*$/gim;

/** Strips "IMAGE: <url>" lines the model appends per the PHOTOS rule and returns them separately. */
function extractImageUrls(text: string): { text: string; imageUrls: string[] } {
  const imageUrls = [...text.matchAll(IMAGE_LINE)].map((m) => m[1]);
  const cleaned = text.replace(IMAGE_LINE, "").trim();
  return { text: cleaned, imageUrls };
}

export async function generateReply(
  tenantId: string,
  guestMessage: string,
  history: ChatMessage[],
  context?: ReplyContext
): Promise<GenerateReplyResult> {
  const retrieved = await retrieveRelevantChunks(tenantId, guestMessage).catch(() => []);
  const systemPrompt = await buildSystemPrompt(tenantId, retrieved, context);

  const reply = await aiProvider.chat({
    systemPrompt,
    messages: [...history, { role: "user", content: guestMessage }],
  });

  const trimmed = reply.trim();
  if (trimmed.startsWith(ESCALATE_MARKER)) {
    return {
      reply: "Thanks for your message — let me get one of our team to help with that, they'll be with you shortly!",
      imageUrls: [],
      shouldEscalate: true,
      escalationReason: trimmed.slice(ESCALATE_MARKER.length).trim(),
    };
  }

  const { text, imageUrls } = extractImageUrls(trimmed);
  return { reply: text, imageUrls, shouldEscalate: false };
}

/** One-sentence CRM summary of a conversation so far, refreshed after each inbound message. */
export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  if (!messages.length) return "";
  const transcript = messages.map((m) => `${m.role === "user" ? "Guest" : "Anushka"}: ${m.content}`).join("\n");
  const summary = await aiProvider.chat({
    systemPrompt:
      "Summarize this WhatsApp conversation between a hotel's AI assistant and a guest in one short sentence (under 20 words), focused on what the guest wants and where things stand. Reply with only the summary, no preamble.",
    messages: [{ role: "user", content: transcript }],
  });
  return summary.trim();
}
