-- How many rooms a corporate/group enquiry asked for.
--
-- Its own column rather than parsing handoverReason, which is a sentence for a
-- human and carries the count in the guest's own language ("3-5 రూమ్‌లు" for a
-- Telugu enquiry). A filter matching on prose breaks the first time the copy is
-- reworded or another language is added.
ALTER TABLE "Contact" ADD COLUMN "groupRooms" TEXT;

-- Backfill the enquiries that came in before the column existed. The reason
-- string was always written as 'Group booking — <count>', so the count is
-- everything after the em dash.
UPDATE "Contact"
SET "groupRooms" = trim(split_part("handoverReason", '—', 2))
WHERE "handoverReason" LIKE 'Group booking%' AND "groupRooms" IS NULL;

-- The CRM's Group filter is "every group enquiry, newest first".
CREATE INDEX "Contact_tenantId_groupRooms_idx" ON "Contact"("tenantId", "groupRooms");
