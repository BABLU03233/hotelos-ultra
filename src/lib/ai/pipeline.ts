import { LeadSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { anthropicProvider } from "./anthropic-provider";
import { AIProvider, ChatMessage } from "./provider";
import { retrieveRelevantChunks } from "./rag";

const aiProvider: AIProvider = anthropicProvider;

const ESCALATE_MARKER = "ESCALATE:";

export interface ReplyContext {
  /** No prior OUT message exists for this contact — Aria has never spoken to them before. */
  isFirstReply: boolean;
  /** Gap since the guest's previous inbound message, or null if this is their first-ever message. */
  daysSinceLastInbound: number | null;
  leadSource: LeadSource;
  sourceDetail: string | null;
}

function buildConversationContext(context?: ReplyContext): string {
  if (!context) return "";

  if (context.isFirstReply && context.leadSource === "META_AD") {
    const about = context.sourceDetail ? ` about "${context.sourceDetail}"` : "";
    return `\nCONVERSATION CONTEXT\nThis is a brand-new enquiry from a Meta ad${about} — they're warm and primed. Open with energy, reference what likely drew them in, and get straight to being useful.\n`;
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
      .map((r) => `- ${r.name} (${r.type}): ₹${r.price}/night, sleeps ${r.capacity}. ${r.description ?? ""}`.trim())
      .join("\n") || "No rooms configured yet.";
  const faqLines = faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n") || "None yet.";
  const offerLines =
    offers.map((o) => `- ${o.title}: ${o.description ?? ""}${o.discount ? ` (${o.discount})` : ""}`.trim()).join("\n") ||
    "None currently.";

  return `
You are Aria, the WhatsApp booking assistant for ${profile?.name ?? "the hotel"}. You greet guests, answer questions, recommend rooms, handle objections, and nurture enquiries toward a booking — but you never take payment and never quote a final, binding rate.
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
- End with one genuine, specific follow-up question when it moves the conversation forward — never a generic "how can I help?"
`.trim();
}

export interface GenerateReplyResult {
  reply: string;
  shouldEscalate: boolean;
  escalationReason?: string;
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
      shouldEscalate: true,
      escalationReason: trimmed.slice(ESCALATE_MARKER.length).trim(),
    };
  }

  return { reply, shouldEscalate: false };
}

/** One-sentence CRM summary of a conversation so far, refreshed after each inbound message. */
export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  if (!messages.length) return "";
  const transcript = messages.map((m) => `${m.role === "user" ? "Guest" : "Aria"}: ${m.content}`).join("\n");
  const summary = await aiProvider.chat({
    systemPrompt:
      "Summarize this WhatsApp conversation between a hotel's AI assistant and a guest in one short sentence (under 20 words), focused on what the guest wants and where things stand. Reply with only the summary, no preamble.",
    messages: [{ role: "user", content: transcript }],
  });
  return summary.trim();
}
