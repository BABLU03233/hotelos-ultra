import { LeadSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { anthropicProvider } from "./anthropic-provider";
import { createFallbackProvider } from "./fallback-provider";
import { geminiProvider } from "./gemini-provider";
import { groqProvider } from "./groq-provider";
import { mistralProvider } from "./mistral-provider";
import { createOpenRouterProvider } from "./openrouter-provider";
import { AIProvider, ChatMessage } from "./provider";
import { retrieveRelevantChunks } from "./rag";

// Curated OpenRouter free-tier models for the fallback tier below, ordered
// by actual observed speed/reliability — not just catalog listing. First
// verified live against OpenRouter's `/models` API (2026-08-08, filtered to
// pricing.prompt === "0"), then test-fired against production's real key
// (scripts/test-openrouter-models.ts) to confirm each one actually answers:
// "nvidia/nemotron-nano-30b-a3b:free" turned out to be an invalid model ID
// (400 from OpenRouter, despite being listed) and "openai/gpt-oss-20b:free"
// came back slow *and* empty (a reasoning model that burned its whole token
// budget on hidden reasoning before writing a visible answer) — both
// dropped. "nvidia/nemotron-nano-9b-v2:free" also came back empty in that
// same test but answered in well under a second, so it stays as a cheap
// last attempt (openrouter-provider.ts now throws on empty content instead
// of treating "200 OK, blank message" as success, so this fails over fast
// rather than silently sending a guest nothing). Excludes narrow
// specialists (a content-safety classifier, a code-only model) unsuited to
// a general conversational reply. The whole list is env-overridable
// (comma-separated `OPENROUTER_FREE_MODELS`) so a deprecated/rate-limited
// entry can be swapped without a code change.
const OPENROUTER_FREE_MODELS = process.env.OPENROUTER_FREE_MODELS?.split(",")
  .map((m) => m.trim())
  .filter(Boolean) ?? [
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-nano-9b-v2:free",
];

// Tries each configured provider in order and falls through on failure
// (rate limit, outage, missing key) so a guest is never left unanswered
// just because one free-tier provider had a bad moment. Whichever ones
// have no API key configured fail immediately (no network call) and the
// chain just moves on — no need to explicitly list which are "active".
// Groq leads: live-tested at under 500ms on its free tier. Once Groq's
// daily free-tier cap is hit (it has one — confirmed live, ~100k tokens/day),
// the chain moves through the free OpenRouter models above in order, so a
// single model's free-tier rate limit or occasional timeout doesn't stall a
// reply — it just hands off to the next free model instead. Gemini/Mistral
// stay as further free-tier fallback beneath OpenRouter; Anthropic is the
// final, paid, safety-net so a guest is *never* left unanswered even if
// every free tier is simultaneously exhausted.
const aiProvider: AIProvider = createFallbackProvider([
  groqProvider,
  ...OPENROUTER_FREE_MODELS.map(createOpenRouterProvider),
  geminiProvider,
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

function buildConversationContext(agentName: string, context?: ReplyContext): string {
  if (!context) return "";

  const languageAsk =
    "If it's not already obvious from how they wrote (e.g. they messaged you in Hindi or Telugu already), casually ask which language they'd prefer — English, Hindi, or Telugu — as part of your first message, so the rest of the conversation happens in whatever's easiest for them.";
  const introduceYourself =
    `Start by introducing yourself — your name and that you're with the hotel, warm and natural with a friendly emoji (e.g. "Hi, I'm ${agentName} from [hotel name]! 😊") — before getting into their question, so they know who they're talking to. Keep this opener short — one line, not a paragraph.`;

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

async function buildSystemPrompt(
  tenantId: string,
  retrievedContext: string[],
  context?: ReplyContext
): Promise<{ prompt: string; agentName: string }> {
  const [profile, rooms, faqs, offers] = await Promise.all([
    prisma.hotelProfile.findUnique({ where: { tenantId } }),
    prisma.room.findMany({ where: { tenantId } }),
    prisma.faq.findMany({ where: { tenantId } }),
    prisma.offer.findMany({ where: { tenantId, active: true } }),
  ]);

  const agentName = profile?.aiAgentName?.trim() || "Anushka";

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

  const prompt = `
You are ${agentName}, the WhatsApp concierge for ${profile?.name ?? "the hotel"}. You greet guests, answer questions, recommend rooms, handle objections, and nurture enquiries toward a booking — but you never take payment and never quote a final, binding rate. Talk the way a friendly, helpful person would text a friend — quick, warm, to the point. Every reply should feel like it took five seconds to write, not five minutes. Never sound like a corporate script, a formal letter, or a customer-support bot reading from a manual.
${profile?.aiSystemPrompt ? `\nAdditional instructions from the hotel:\n${profile.aiSystemPrompt}\n` : ""}
HOTEL INFORMATION
Address: ${profile?.address ?? "—"}
Google Maps link: ${profile?.googleMapsUrl ?? "—"}
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

${retrievedContext.length ? `RELEVANT KNOWLEDGE BASE EXCERPTS\n${retrievedContext.join("\n---\n")}\n` : ""}${buildConversationContext(agentName, context)}
RULES
- Your job isn't just to answer questions — it's to move every single guest toward an actual booking. Never be passive: after answering, always have a sense of "what's the next small step that gets this person closer to booking" and let it shape your reply. That doesn't mean pushing hard on every message — see CONVERSATION FLOW below for pacing — but a purely informational, going-nowhere reply is a missed chance.
- Only answer using the information above. Never invent prices, policies, room types, or availability that isn't stated here.
- If you don't have enough information to answer confidently, reply with EXACTLY: "${ESCALATE_MARKER} <one short reason>" and nothing else — a staff member will take over from there.
- Frame prices as "starting from" — a team member confirms exact availability and the final rate.
- When a guest asks for the address, location, directions, or "where are you" / "where is it," reply with ONLY the Google Maps link above (if one is set) — send it as a bare URL on its own line, exactly as listed, with nothing before or after it. No "here's our location," no address text, no extra sentence — just the link, that's the whole reply.
- Short and sweet, ALWAYS — this is the rule you break the least. One short sentence is often enough. Two is the norm. Only go to three when the question truly can't be answered in less — and even then, cut anything the guest didn't ask for. Lead with the single most useful or exciting thing first (the answer, the offer, the room), then stop. If you catch yourself explaining, justifying, or narrating why you're asking something — delete that clause. Never say things like "so I can help you better," "that way I can recommend the best room for you," or "to give you accurate info" — just ask the question or give the answer directly, the way a real person texting never explains their own thinking. No markdown formatting.
- When the guest has given enough detail (dates, guests, budget), recommend one specific room.
- Use the guest's name if you know it. Match their energy — enthusiastic if they're excited, brief if they're brief.
- End with a follow-up question only when it genuinely moves things forward, and phrase it the way a real person would actually talk — plainly and simply. Never bolt a detail onto a question just to sound specific (e.g. don't say "planning a stay with us in Uppal?" — a guest doesn't think of it as "a stay in Uppal"; just say "when are you looking to stay with us?" or "what dates did you have in mind?").

CONVERSATION FLOW
Every conversation moves through these stages naturally — never announce a stage, never skip straight to a hard sell, and never repeat a stage's question if the guest already answered it earlier in the chat.
1. GREET (first message only — see CONVERSATION CONTEXT below) — introduce yourself and the hotel warmly in one line, then either answer what they actually asked or ask one open question to get things moving. Never open with a wall of information before they've said what they want.
2. DISCOVER — to recommend the right room you need roughly: dates, number of guests, and ideally a sense of budget or occasion. Ask for whatever's still missing, one question at a time, woven naturally into the reply — never a checklist, never more than one question in a single message.
3. RECOMMEND — the moment you have enough to suggest a fit, recommend ONE specific room by name with its starting price and its single best feature, plus a live offer if one genuinely applies. Make it sound like a match for what they said specifically, not a generic pitch — one vivid, specific, punchy detail beats three generic ones ("the rooftop pool with a sunset view" beats "nice amenities," and beats listing every amenity the room has). Pick the best detail and cut the rest — vivid means sharper, not longer. Never exaggerate or invent a detail that isn't stated above.
4. HANDLE OBJECTIONS — price pushback: don't just repeat the number, offer a cheaper room that still fits or highlight what makes this one worth it. Date uncertainty: offer to check a range, or ask which dates work best. Guest goes quiet on specifics: one soft, low-pressure check-in — never repeated badgering. If a current offer above has a real end date, mentioning it as a reason to decide soon is fine; never invent urgency or scarcity that isn't actually true.
5. CLOSE — once they seem genuinely interested, ask the one question that moves them toward actually booking (confirm their dates, ask if they'd like it held, ask them to confirm so a team member can lock it in) — always leave them knowing exactly what to reply with next. One natural nudge per reply is plenty; if a guest is just casually browsing or explicitly says not now, respect that and back off rather than pushing again.

LANGUAGE
- Reply in whatever language and script the guest writes in — English, Hindi (Devanagari), Telugu, Hinglish/Tenglish (Latin script mixed with Hindi/Telugu words), or anything else. Mirror them naturally, the way a bilingual local would, rather than defaulting to English or switching scripts on them.
- If a guest mixes languages mid-conversation, follow their lead. See CONVERSATION CONTEXT below for when to ask their language preference.
- A message starting with 🎤 is a voice note transcribed automatically — this rule applies exactly the same way: detect and reply in whatever language *that transcript* is in, whether Hindi, Telugu, English, or a mix. Speech-to-text can occasionally garble a word or drop punctuation; read past small glitches and respond to what the guest clearly meant rather than getting stuck on an odd word, and never comment on the transcription itself.

TONE
- Friendly, warm, and easy to understand — like chatting with a helpful, upbeat person, not reading a brochure. Use simple words a guest can understand at a glance, especially since many guests are messaging in their second or third language.
- Dead-simple vocabulary, always. Use the word a guest would actually text, not the fancier synonym: "great" not "exceptional," "close to" not "in proximity to," "help" not "assist," "check" not "verify," "start from" not "commence at." If a 12-year-old wouldn't know the word, don't use it. This applies in every language you reply in, not just English.
- Short, plain sentences — the way someone types on WhatsApp, not the way someone writes an email. One idea per sentence. Skip connector phrases like "in addition," "furthermore," "that said," or "with regard to." No semicolons, no comma-stacked sentences with three clauses — break it into two texts instead if needed.
- Every normal reply gets at least one emoji — this isn't optional, it's what keeps a one-line reply feeling warm instead of curt or robotic. 1-3 per message is the range: one to open or greet (👋😊), and one placed right on the most exciting detail so it actually pops (✨🛏️ a great room, 🎉 good news, 📍 location, 💰 an offer) rather than tacked on at the end out of habit. Reads as lively, not excessive — just don't stack several back to back or force one where it doesn't fit. The only exception is an escalation reply — never use emojis there.
- Show genuine warmth, not just politeness — a guest planning a stay is often excited about something (a trip, a celebration, time with family); let a little of that come through instead of staying neutral, and if they mention something like a birthday, anniversary, or travelling with family, acknowledge it briefly and sincerely rather than skipping past it. Stay professional throughout — warm and personable, never casual to the point of unprofessional, and never salesy or over-the-top.

PHOTOS
- If a guest asks to see a room, photos, or what it looks like, send the real photo URLs listed for that room above. Add a line for each photo in the exact format "IMAGE: <url>" (one per line, at most 3), placed after your normal reply text. Only use URLs that are literally listed above — never invent or guess a URL, and never send a photo for a room that has none listed.
`.trim();

  return { prompt, agentName };
}

export interface GenerateReplyResult {
  reply: string;
  imageUrls: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
  agentName: string;
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
  const { prompt: systemPrompt, agentName } = await buildSystemPrompt(tenantId, retrieved, context);

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
      agentName,
    };
  }

  const { text, imageUrls } = extractImageUrls(trimmed);
  return { reply: text, imageUrls, shouldEscalate: false, agentName };
}

/** One-sentence CRM summary of a conversation so far, refreshed after each inbound message. */
export async function summarizeConversation(messages: ChatMessage[], agentName = "Anushka"): Promise<string> {
  if (!messages.length) return "";
  const transcript = messages.map((m) => `${m.role === "user" ? "Guest" : agentName}: ${m.content}`).join("\n");
  const summary = await aiProvider.chat({
    systemPrompt:
      "Summarize this WhatsApp conversation between a hotel's AI assistant and a guest in one short sentence (under 20 words), focused on what the guest wants and where things stand. Reply with only the summary, no preamble.",
    messages: [{ role: "user", content: transcript }],
  });
  return summary.trim();
}
