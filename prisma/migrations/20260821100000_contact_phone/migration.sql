-- The number guests should ring, shown as a tappable "Call us" option.
--
-- Separate from the WhatsApp line: hotels usually want calls going to
-- reception's landline, and the WhatsApp number is often virtual and cannot
-- take a voice call at all.
ALTER TABLE "HotelProfile" ADD COLUMN "contactPhone" TEXT;
