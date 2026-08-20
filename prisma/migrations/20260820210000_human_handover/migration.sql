-- Human handover: a receptionist explicitly holding a conversation.
--
-- Distinct from Contact.aiPaused, which expires after 12 hours so a forgotten
-- pause cannot silence the assistant forever. A handover must NOT expire: a
-- receptionist mid-booking cannot have the AI wake up overnight and start
-- talking over them.
ALTER TABLE "Contact" ADD COLUMN "handoverAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "handoverByName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "handoverReason" TEXT;

-- What the receptionist wants the AI to know when it picks the conversation
-- back up. Fed into the prompt, not just filed in the CRM.
ALTER TABLE "Contact" ADD COLUMN "aiBriefing" TEXT;

-- Contacts who already have a confirmed or pending booking predate this
-- feature. They are exactly the conversations a human should be holding, so
-- put them in handover rather than leaving the AI to negotiate a stay that is
-- already booked.
UPDATE "Contact"
SET "handoverAt" = COALESCE("updatedAt", now()),
    "handoverReason" = 'Booking on file',
    "aiPaused" = true,
    "aiPausedAt" = COALESCE("aiPausedAt", "updatedAt", now())
WHERE "bookingStatus" IN ('PENDING', 'CONFIRMED');
