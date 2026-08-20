-- Platform review of a broadcast before it reaches guests.
--
-- A campaign goes to many people at once and cannot be recalled, and every
-- complaint lands on the WhatsApp number's quality rating — shared
-- infrastructure, so one hotel's careless blast degrades delivery for every
-- other hotel on the platform.
CREATE TYPE "CampaignApproval" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- Default PENDING_REVIEW, not APPROVED: a code path that forgets to set this
-- must fail closed (held for review) rather than open (sent to guests).
ALTER TABLE "Campaign" ADD COLUMN "approval" "CampaignApproval" NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "Campaign" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "reviewedByName" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "autoReview" JSONB;

-- Campaigns that already went out predate review and must not reappear in the
-- operator's queue as though they were waiting.
UPDATE "Campaign" SET "approval" = 'APPROVED', "reviewedAt" = "sentAt" WHERE "sentAt" IS NOT NULL;

-- The review queue is "everything pending, oldest first", across all tenants.
CREATE INDEX "Campaign_approval_submittedAt_idx" ON "Campaign"("approval", "submittedAt");
