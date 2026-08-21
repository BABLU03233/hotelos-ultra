-- Per-occupancy pricing, e.g. [{"guests":1,"price":999},{"guests":2,"price":1299}].
--
-- Indian hotels price per party size, not per room. Until now that only existed
-- as prose inside Room.description, so the assistant could only quote "from
-- ₹999" — a guest for two was always shown a number that was not their number.
ALTER TABLE "Room" ADD COLUMN "occupancyPrices" JSONB;
