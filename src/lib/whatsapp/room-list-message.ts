import { truncateRowTitle } from "./row-title";
import { describeTiers, hasExactTier, lowestPrice, priceForGuests } from "@/lib/booking/occupancy-price";
import { GuestLanguage, resolveLanguage, t } from "@/lib/i18n/guest-language";
import { GREET_QUESTION_BUTTON_ID } from "@/lib/ai/interactive-prompts";

const MAX_ROWS = 10; // WhatsApp Cloud API: max 10 rows total across all sections
const ROW_DESCRIPTION_MAX = 72;

export interface RoomListMessage {
  type: "list";
  body: string;
  buttonText: string;
  sections: { rows: { id: string; title: string; description: string }[] }[];
}

/**
 * Every room the hotel can actually give this guest, as a list they choose
 * from — names, prices and capacities straight out of the database.
 *
 * This is now the RECOMMEND step, not just a "see other options" fallback,
 * and the reason is a real incident: asked to recommend, the model picked
 * one room on the guest's behalf and quoted ₹1,899 and ₹2,199 for rooms that
 * cost ₹1,299 and ₹1,599 — inventing prices 46% and 37% above the real ones
 * while the correct figures sat in its own prompt. A guest could have
 * arrived expecting one price and been charged another.
 *
 * Two problems, one fix. Choosing for the guest was never ours to do — with
 * three rooms and one guest, the shortlist IS the answer. And routing the
 * decision through a list built from Room rows takes the model out of the
 * pricing path entirely: a database row cannot hallucinate a rate.
 *
 * A List Message rather than reply buttons, per the product's standing rule:
 * no reply-arrow icons anywhere in the flow.
 */
/**
 * The rate line under a room's name.
 *
 * Three cases, in order of how much we know:
 *   party size known  -> the exact rate for that many people
 *   tiers configured  -> the whole table ("1p ₹999 · 2p ₹1,299")
 *   neither           -> the old "from" line, unchanged
 */
function describeRoomPrice(
  room: { price: number; capacity: number; occupancyPrices?: unknown },
  s: ReturnType<typeof t>,
  guests?: number | null
): string {
  if (guests && guests > 0) {
    const price = priceForGuests(room, guests);
    // Only state a rate AS this party's rate when the hotel published one for
    // exactly this size. Otherwise say it is a starting point and that a
    // person will confirm — the room is still offered, the number is just not
    // dressed up as a quote nobody made.
    return hasExactTier(room, guests) ? s.roomPriceForParty(price, guests) : s.roomPriceForPartyApprox(price, guests);
  }
  const tiers = describeTiers(room, ROW_DESCRIPTION_MAX);
  if (tiers) return tiers;
  return s.roomListDesc(lowestPrice(room), room.capacity);
}

export function buildRoomListMessage(
  rooms: { id: string; name: string; price: number; capacity: number; occupancyPrices?: unknown }[],
  lang?: GuestLanguage | null,
  /**
   * Whether real dates are known for this guest.
   *
   * Probed live: tapping "Availability & price" straight from the greeting —
   * before any date was mentioned — answered "We have 3 rooms free for your
   * dates". There were no dates. Claiming an availability check that never
   * happened is worse than saying nothing, because the guest plans around it.
   *
   * Defaults to true so existing callers that DO have dates are unchanged.
   */
  datesKnown: boolean = true,
  /**
   * The party size, when known.
   *
   * With it, each row quotes what THIS guest will actually pay. Without it the
   * row shows the whole tier table, so they can see where they land rather
   * than being given a "from" price they will never be charged — the reason
   * this parameter exists at all.
   */
  guests?: number | null
): RoomListMessage {
  const s = t(resolveLanguage(lang));
  // One slot is reserved for "Know more", so rooms take at most 9 of the 10.
  const rows = rooms.slice(0, MAX_ROWS - 1).map((r) => ({
    id: `room_pick_${r.id}`,
    title: truncateRowTitle(s.bookRoom(r.name)),
    description: describeRoomPrice(r, s, guests).slice(0, ROW_DESCRIPTION_MAX),
  }));

  // Reuses the existing FAQ-list handler rather than inventing a new id — a
  // guest who wants detail before choosing gets the hotel's real answers,
  // and no new routing has to be written or tested.
  rows.push({
    id: GREET_QUESTION_BUTTON_ID,
    title: truncateRowTitle(s.knowMore),
    description: s.knowMoreDesc.slice(0, ROW_DESCRIPTION_MAX),
  });

  return {
    type: "list",
    body: datesKnown ? s.roomChoiceBody() : s.roomChoiceBodyNoDates(),
    buttonText: s.roomListButton,
    sections: [{ rows }],
  };
}
