import { looksLikeObviousLanguage, readyToOfferRooms, resolveDeterministicReply } from "@/lib/ai/interactive-prompts";
import { generateReply, summarizeConversation } from "@/lib/ai/pipeline";
import { ChatMessage } from "@/lib/ai/provider";
import { findUnavailableRoomIds } from "@/lib/booking/availability";
import { captureGuestCount } from "@/lib/booking/guest-count";
import { resolveLanguage, t } from "@/lib/i18n/guest-language";
import { resolveTypedRelativeDates } from "@/lib/booking/quick-pick-dates";
import { matchRecommendedRoom } from "@/lib/booking/room-match";
import { ProcessMessageJob } from "@/lib/queue/queues";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { buildRoomListMessage } from "@/lib/whatsapp/room-list-message";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

const HISTORY_LIMIT = 12;

async function scheduleFollowUps(tenantId: string, contactId: string): Promise<void> {
  await prisma.scheduledFollowUp.updateMany({
    where: { tenantId, contactId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const rules = await prisma.followUpRule.findMany({ where: { tenantId, active: true } });
  if (!rules.length) return;

  const now = Date.now();
  await prisma.scheduledFollowUp.createMany({
    data: rules.map((rule) => ({
      tenantId,
      contactId,
      ruleId: rule.id,
      runAt: new Date(now + rule.delayMinutes * 60_000),
      status: "PENDING" as const,
    })),
  });
}

/** Runs inside the BullMQ worker (src/worker/index.ts) for the message-processing queue. */
export async function processMessageJob(job: ProcessMessageJob): Promise<void> {
  const { tenantId, contactId } = job;

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.tenantId !== tenantId) return;

  // Staff has taken this conversation over manually — the AI stays silent
  // until they hand it back (M3: "pauses AI for that contact").
  if (contact.aiPaused) return;

  const recentMessages = await prisma.message.findMany({
    where: { tenantId, contactId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const chronological = [...recentMessages].reverse();
  const inboundMessages = chronological.filter((m) => m.direction === "IN");
  const latestInbound = inboundMessages.at(-1);

  // An attachment with no caption used to return here, silently. That made
  // this the only path in the whole flow capable of leaving a guest with no
  // reply at all — someone sends a photo and the conversation simply stops,
  // which contradicts the principle every other branch follows. There is
  // nothing for the AI to read (transcription already ran and produced
  // nothing), so this is answered deterministically: acknowledge what
  // arrived and ask for it in words, in the guest's own language.
  if (!latestInbound) return;
  if (!latestInbound.content) {
    const creds = await getWhatsAppCredentials(tenantId);
    if (!creds) return;
    const text = t(resolveLanguage(contact.language)).mediaNoticed;
    try {
      const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text });
      await prisma.message.create({
        data: { tenantId, contactId, direction: "OUT", type: "TEXT", content: text, whatsappMessageId, status: "SENT" },
      });
    } catch (err) {
      console.error(`Media acknowledgement failed for tenant ${tenantId}, contact ${contactId}:`, err);
    }
    return;
  }

  const history: ChatMessage[] = chronological
    .filter((m) => m.id !== latestInbound.id && m.content)
    .map((m) => ({ role: m.direction === "IN" ? "user" : "assistant", content: m.content! }));

  // Party size the guest states on THIS turn, if any — read before either
  // reply path runs, since the deterministic path below never calls
  // generateReply and this is the only point both paths share. Persisted at
  // the end of the turn so it survives the 12-message history window, which
  // is what actually caused guests to be re-asked something they'd already
  // answered (see src/lib/booking/guest-count.ts).
  const capturedGuestCount = captureGuestCount(latestInbound.content, history, contact.pendingGuestCount);
  const knownGuestCount = capturedGuestCount ?? contact.pendingGuestCount ?? null;

  // Tier-1.5 date capture, between the tapped rows (fully deterministic) and
  // the AI's DATES: marker (best-effort): a guest who TYPES "this weekend"
  // or "kal" gets the same real, structured range a tap would have produced.
  // Without this the most common phrasing in the funnel resolved to nothing
  // storable, so availability couldn't be checked for it and the dates
  // question re-fired once the turn scrolled out of the history window.
  // Only fills a gap — never overwrites dates already agreed.
  const typedDates =
    contact.pendingCheckIn && contact.pendingCheckOut ? null : resolveTypedRelativeDates(latestInbound.content);
  const effectiveCheckIn = contact.pendingCheckIn ?? typedDates?.checkIn ?? null;
  const effectiveCheckOut = contact.pendingCheckOut ?? typedDates?.checkOut ?? null;

  // Warm vs. cold framing for Anushka: a fresh ad lead gets an energetic open,
  // a guest who's gone quiet for a while gets a gentle re-spark instead of
  // Anushka just resuming mid-conversation as if no time passed.
  const previousInbound = inboundMessages.length > 1 ? inboundMessages[inboundMessages.length - 2] : null;

  // A returning guest, from their own confirmed bookings — one small indexed
  // query for the single most useful thing a concierge can know about who
  // they're talking to. CANCELLED bookings are excluded deliberately: someone
  // who cancelled has not stayed, and "welcome back" would be wrong.
  const priorBookings = await prisma.booking.findMany({
    where: { tenantId, contactId, status: "CONFIRMED" },
    orderBy: { checkOut: "desc" },
    select: { roomNameSnapshot: true, checkOut: true },
    take: 10,
  });
  const returning = priorBookings.length
    ? {
        stays: priorBookings.length,
        lastRoomName: priorBookings[0].roomNameSnapshot,
        lastCheckOut: priorBookings[0].checkOut,
      }
    : null;

  const replyContext = {
    isFirstReply: !chronological.some((m) => m.direction === "OUT"),
    daysSinceLastInbound: previousInbound
      ? Math.floor((latestInbound.createdAt.getTime() - previousInbound.createdAt.getTime()) / 86_400_000)
      : null,
    leadSource: contact.leadSource,
    sourceDetail: contact.sourceDetail,
    knownGuestCount,
    // Lets buildSystemPrompt resolve real availability for exactly these
    // dates before the reply is written, so an already-booked room is never
    // recommended (see availability.ts).
    stayDates: effectiveCheckIn && effectiveCheckOut ? { checkIn: effectiveCheckIn, checkOut: effectiveCheckOut } : null,
    // Governs the AI prose. The deterministic replies are localised via the
    // catalog; this is what keeps the model in the same language.
    language: resolveLanguage(contact.language),
    // WhatsApp sends this on every inbound message and we have always stored
    // it; until now it never reached the prompt, so the model was told to use
    // the guest's name without ever being given one.
    guestName: contact.name,
    returning,
  };

  const profile = await prisma.hotelProfile.findUnique({ where: { tenantId }, select: { aiAgentName: true, name: true } });
  const agentNameFallback = profile?.aiAgentName?.trim() || "Anushka";

  // ---- Rooms are offered, never chosen on the guest's behalf ----
  // Live incident: asked to recommend, the model picked one room for the
  // guest and quoted ₹1,899 and ₹2,199 for rooms costing ₹1,299 and ₹1,599 —
  // inventing prices 46% and 37% above the real ones while the correct
  // figures sat in its own prompt.
  //
  // Two problems with one fix. Choosing was never ours to do: with a handful
  // of rooms, the shortlist IS the answer. And building that list from Room
  // rows takes the model out of the pricing path entirely — a database row
  // cannot hallucinate a rate. Sent here rather than through the AI for the
  // same reason every other real-data list is.
  if (
    readyToOfferRooms({ history, guestMessage: latestInbound.content, knownGuestCount, datesKnown: Boolean(effectiveCheckIn && effectiveCheckOut) })
  ) {
    const rooms = await prisma.room.findMany({ where: { tenantId }, orderBy: { price: "asc" } });
    const taken =
      effectiveCheckIn && effectiveCheckOut
        ? await findUnavailableRoomIds(prisma, tenantId, effectiveCheckIn, effectiveCheckOut).catch(() => new Set<string>())
        : new Set<string>();
    const offerable = rooms.filter((r) => !taken.has(r.id));

    if (offerable.length) {
      const creds = await getWhatsAppCredentials(tenantId);
      if (!creds) return;
      const list = buildRoomListMessage(offerable, resolveLanguage(contact.language));
      try {
        const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, {
          type: "list",
          body: list.body,
          buttonText: list.buttonText,
          sections: list.sections,
        });
        // The persisted content carries the rooms and their prices, not just
        // the body line. Two reasons, and the first is a loop:
        //
        // "already shown a room" is detected by scanning assistant messages
        // for a room price (mentionsRoomPrice). The body alone — "We have 3
        // rooms free for your dates" — contains no price, so that check
        // stayed false and readyToOfferRooms kept returning true, re-sending
        // the identical list on every subsequent turn with no way out.
        //
        // Second, it's simply the truer record: the guest saw these rooms and
        // these rates, so that is what the CRM transcript should show.
        const persisted = [list.body, ...list.sections[0].rows.map((r) => `${r.title} — ${r.description}`)].join("\n");
        await prisma.message.create({
          data: { tenantId, contactId, direction: "OUT", type: "INTERACTIVE", content: persisted, whatsappMessageId, status: "SENT" },
        });
        if (contact.leadStatus === "NEW") {
          await prisma.contact.update({ where: { id: contactId }, data: { leadStatus: "INTERESTED", lastMessage: list.body } });
        }
      } catch (err) {
        console.error(`Room shortlist send failed for tenant ${tenantId}, contact ${contactId}:`, err);
      }
      return;
    }
    // Nothing free for those dates — fall through so the AI can say so and
    // the waterfall re-offers dates, rather than sending an empty list.
  }

  // Real room name + exact dates for the CONFIRM_BOOKING summary below --
  // only fetched when both are actually known, so a guest sees exactly what
  // they're confirming instead of a generic nudge with no specifics.
  const pendingRoom =
    contact.pendingRoomId && contact.pendingCheckIn && contact.pendingCheckOut
      ? await prisma.room.findUnique({ where: { id: contact.pendingRoomId }, select: { name: true } })
      : null;
  const bookingSummary =
    pendingRoom && contact.pendingCheckIn && contact.pendingCheckOut
      ? { roomName: pendingRoom.name, checkIn: contact.pendingCheckIn, checkOut: contact.pendingCheckOut }
      : undefined;

  // Closes a real class of bug found live twice: a weak fallback model
  // writing free text that ignores its own predicted-stage instruction
  // (e.g. asking about dates right under a language-selection list) while
  // the waterfall still -- correctly -- attaches the predicted list
  // underneath. For stages where the next message is 100% predictable and
  // needs zero real judgment, skip AI text-generation entirely -- see
  // resolveDeterministicReply's own docs for exactly which stages and why.
  const languageObvious =
    looksLikeObviousLanguage(latestInbound.content) || history.some((m) => m.role === "user" && looksLikeObviousLanguage(m.content));
  const deterministic = resolveDeterministicReply({
    isFirstReply: replyContext.isFirstReply,
    languageObvious,
    history,
    guestMessage: latestInbound.content,
    hotelName: profile?.name ?? undefined,
    bookingSummary,
    language: resolveLanguage(contact.language),
    knownGuestCount,
    datesKnown: Boolean(effectiveCheckIn && effectiveCheckOut),
  });

  let generated: Awaited<ReturnType<typeof generateReply>>;
  if (deterministic) {
    generated = {
      reply: deterministic.text,
      imageUrls: [],
      interactive: deterministic.interactive,
      shouldEscalate: false,
      agentName: agentNameFallback,
    };
  } else {
    try {
      generated = await generateReply(tenantId, latestInbound.content, history, replyContext);
    } catch (err) {
      // A dead-end here (every free-tier provider simultaneously exhausted,
      // with no configured paid Anthropic key as the safety net -- a real,
      // live-observed production gap, not hypothetical) previously only
      // created a staff notification and returned -- the STAFF found out,
      // but the GUEST got total silence, directly contradicting this
      // function's own stated intent ("must never leave the guest silently
      // unanswered") and the real behavior of an AI-side escalation, which
      // always sends the guest a real holding message too. Now does the
      // same: a fixed, safe holding reply, sent and persisted exactly like
      // a normal reply, so the guest always gets *something* even in the
      // worst-case total-outage scenario.
      console.error(`generateReply failed for tenant ${tenantId}, contact ${contactId}:`, err);
      const holdingText = "Thanks for your message — let me get one of our team to help with that, they'll be with you shortly!";
      try {
        const creds = await getWhatsAppCredentials(tenantId);
        if (creds) {
          const whatsappMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text: holdingText });
          await prisma.message.create({
            data: { tenantId, contactId, direction: "OUT", type: "TEXT", content: holdingText, whatsappMessageId, status: "SENT" },
          });
        }
      } catch (sendErr) {
        console.error(`Holding-message send also failed for tenant ${tenantId}, contact ${contactId}:`, sendErr);
      }
      await prisma.staffNotification.create({
        data: { tenantId, contactId, reason: `${agentNameFallback} couldn't generate a reply — needs a manual response.` },
      });
      return;
    }
  }
  const { reply, imageUrls, interactive, shouldEscalate, escalationReason, agentName, pendingDates } = generated;

  const creds = await getWhatsAppCredentials(tenantId);
  if (!creds) {
    console.warn(`Tenant ${tenantId} has no WhatsApp credentials configured — cannot send AI reply.`);
    await prisma.staffNotification.create({
      data: { tenantId, contactId, reason: `${agentName} drafted a reply but WhatsApp isn't connected yet — connect it in Settings.` },
    });
    return;
  }

  let whatsappMessageId: string;
  try {
    // An interactive/list message carries its body text inside the same
    // payload as the buttons/rows (unlike IMAGE, which is a genuine separate
    // follow-up message) — this replaces the text send for the turn, not
    // adds to it. GUEST_COUNT/DATE_QUICK_PICK render as a List Message
    // (no reply-arrow icon, one extra tap to open) — see interactive-prompts.ts.
    whatsappMessageId = !interactive
      ? await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "text", text: reply })
      : interactive.type === "list"
        ? await sendWhatsAppMessage(creds, contact.whatsappNumber, {
            type: "list",
            body: reply,
            buttonText: interactive.buttonText,
            sections: [{ rows: interactive.rows }],
          })
        : await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "interactive", body: reply, buttons: interactive.buttons });
  } catch (err) {
    console.error(`sendWhatsAppMessage failed for tenant ${tenantId}, contact ${contactId}:`, err);
    await prisma.staffNotification.create({
      data: { tenantId, contactId, reason: `${agentName}'s reply failed to send over WhatsApp — needs a manual response.` },
    });
    return;
  }

  // Anushka's reply is already on WhatsApp at this point — everything below
  // is bookkeeping (persisting the record, notifying staff, updating contact
  // state, scheduling follow-ups). None of it may ever throw past this try:
  // an uncaught error here would make BullMQ retry the whole job (up to
  // `attempts: 3`, see queues.ts), which would call generateReply and
  // sendWhatsAppMessage again — a second, differently-worded reply to a
  // guest who already got one.
  try {
    await prisma.message.create({
      data: {
        tenantId,
        contactId,
        direction: "OUT",
        type: interactive ? "INTERACTIVE" : "TEXT",
        content: reply,
        whatsappMessageId,
        status: "SENT",
      },
    });

    for (const url of imageUrls) {
      try {
        const imageMessageId = await sendWhatsAppMessage(creds, contact.whatsappNumber, { type: "image", link: url });
        await prisma.message.create({
          data: {
            tenantId,
            contactId,
            direction: "OUT",
            type: "IMAGE",
            mediaUrl: url,
            whatsappMessageId: imageMessageId,
            status: "SENT",
          },
        });
      } catch (err) {
        // Non-fatal: the guest already has Anushka's text reply, a missed photo isn't worth escalating over.
        console.error(`Failed to send room photo for tenant ${tenantId}, contact ${contactId}:`, err);
      }
    }

    if (shouldEscalate) {
      await prisma.staffNotification.create({
        data: { tenantId, contactId, reason: escalationReason || `${agentName} couldn't answer confidently` },
      });
    }

    const summary = await summarizeConversation(
      [...history, { role: "user", content: latestInbound.content }, { role: "assistant", content: reply }],
      agentName
    ).catch(() => contact.aiSummary ?? "");

    // Real-time-availability capture (see availability.ts): a room match is
    // only looked up when this reply actually names one, and only merged in
    // when found -- a miss (0 or >1 rooms matched) leaves whatever was
    // already pending untouched rather than clearing it out. Same for
    // pendingDates: only present when the AI's DATES: marker fired this turn.
    const rooms = await prisma.room.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const matchedRoomId = matchRecommendedRoom(reply, rooms);

    await prisma.contact.update({
      where: { id: contactId },
      data: {
        lastMessage: reply,
        aiSummary: summary,
        leadStatus: contact.leadStatus === "NEW" ? "INTERESTED" : contact.leadStatus,
        ...(matchedRoomId ? { pendingRoomId: matchedRoomId } : {}),
        // The AI's own DATES: marker wins when it fired this turn (it can
        // parse specifics like "15th to 17th" that the typed-relative
        // resolver deliberately won't guess at); the typed fallback fills in
        // otherwise. Either way this only ever writes when nothing was
        // already agreed — see the guard on typedDates above.
        ...(pendingDates
          ? { pendingCheckIn: pendingDates.checkIn, pendingCheckOut: pendingDates.checkOut }
          : typedDates
            ? { pendingCheckIn: typedDates.checkIn, pendingCheckOut: typedDates.checkOut }
            : {}),
        // Same "only merge in when actually found" rule as the two above —
        // captureGuestCount returns undefined unless this turn stated a
        // count that differs from what's stored, so an unchanged value never
        // generates a pointless write.
        ...(capturedGuestCount != null ? { pendingGuestCount: capturedGuestCount } : {}),
      },
    });

    if (contact.leadStatus !== "BOOKED" && contact.leadStatus !== "CLOSED") {
      await scheduleFollowUps(tenantId, contactId);
    }
  } catch (err) {
    console.error(`Post-send bookkeeping failed for tenant ${tenantId}, contact ${contactId}:`, err);
  }
}
