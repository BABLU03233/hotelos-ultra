import { GuestLanguage, resolveLanguage, t } from "@/lib/i18n/guest-language";
import { GREET_QUESTION_BUTTON_ID } from "@/lib/ai/interactive-prompts";

const MAX_ROWS = 10; // WhatsApp Cloud API: max 10 rows total across all sections
const ROW_TITLE_MAX = 24;
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
export function buildRoomListMessage(
  rooms: { id: string; name: string; price: number; capacity: number }[],
  lang?: GuestLanguage | null
): RoomListMessage {
  const s = t(resolveLanguage(lang));
  // One slot is reserved for "Know more", so rooms take at most 9 of the 10.
  const rows = rooms.slice(0, MAX_ROWS - 1).map((r) => ({
    id: `room_pick_${r.id}`,
    title: s.bookRoom(r.name).slice(0, ROW_TITLE_MAX),
    description: s.roomListDesc(r.price, r.capacity).slice(0, ROW_DESCRIPTION_MAX),
  }));

  // Reuses the existing FAQ-list handler rather than inventing a new id — a
  // guest who wants detail before choosing gets the hotel's real answers,
  // and no new routing has to be written or tested.
  rows.push({
    id: GREET_QUESTION_BUTTON_ID,
    title: s.knowMore.slice(0, ROW_TITLE_MAX),
    description: s.knowMoreDesc.slice(0, ROW_DESCRIPTION_MAX),
  });

  return {
    type: "list",
    body: s.roomChoiceBody(rooms.length),
    buttonText: s.roomListButton,
    sections: [{ rows }],
  };
}
