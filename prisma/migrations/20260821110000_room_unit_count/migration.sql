-- How many of each room type the hotel actually has.
--
-- Availability assumed exactly one physical room per type, so one booking of
-- "Classic Room" removed Classic from every other guest for those dates — a
-- hotel with ten Classic rooms looked sold out after a single booking.
--
-- NULL means "inventory is not a constraint", which is the default: the cost of
-- a wrong "sold out" is the entire booking, while the cost of a wrong
-- "available" is a conversation at the desk, where these are confirmed anyway.
ALTER TABLE "Room" ADD COLUMN "unitCount" INTEGER;
