-- When an AI pause started, so a stale one can expire.
--
-- Sending a manual CRM reply sets aiPaused, and nothing ever cleared it — so
-- one staff message silenced the assistant for that guest permanently. Found
-- in production with 5 of 8 contacts dead: guests messaged "Hi" and got
-- nothing at all, for a day.
--
-- Backfilled from updatedAt for rows already paused. Without a timestamp they
-- would read as freshly paused and stay silent all over again.
ALTER TABLE "Contact" ADD COLUMN "aiPausedAt" TIMESTAMP(3);
UPDATE "Contact" SET "aiPausedAt" = "updatedAt" WHERE "aiPaused" = true;
