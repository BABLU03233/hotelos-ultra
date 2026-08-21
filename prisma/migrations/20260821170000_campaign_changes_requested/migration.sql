-- Two gaps found by the same live broadcast.
--
-- 1. A reviewer who wanted one word changed had only Approve or Reject. What
--    happened live: the reviewer typed "just change it as ON ALL ROOMS to ON
--    ROOMS AT" into the note box and clicked Approve — so the campaign went
--    out unchanged, with the requested edit recorded next to it as an audit
--    note nobody would ever act on. CHANGES_REQUESTED sends it back to the
--    hotel instead, to fix and resubmit.
--
-- 2. That same campaign showed "Sent" while BOTH recipients had failed. They
--    had never messaged the hotel (lastInboundAt IS NULL), so an image
--    broadcast could not reach them under Meta's 24-hour rule — correct
--    behaviour, invisibly applied. A FAILED row recorded no reason, so
--    neither the owner nor anyone debugging could tell that from a Meta
--    outage or a missing WhatsApp connection.
ALTER TYPE "CampaignApproval" ADD VALUE 'CHANGES_REQUESTED' BEFORE 'REJECTED';

ALTER TABLE "CampaignRecipient" ADD COLUMN "failureReason" TEXT;
