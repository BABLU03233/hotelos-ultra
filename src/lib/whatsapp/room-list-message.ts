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
 * Builds the "See other options" List Message from real Room rows — a
 * guest tapping this gets the tenant's actual room names/prices, not a
 * free-tier model's prose attempt at relaying the same data a second time.
 * Pure/DB-free so it's unit-testable; the caller (handle-inbound-message.ts)
 * does the actual Room query and send.
 */
export function buildRoomListMessage(rooms: { id: string; name: string; price: number; capacity: number }[]): RoomListMessage {
  const rows = rooms.slice(0, MAX_ROWS).map((r) => ({
    id: `room_pick_${r.id}`,
    title: r.name.slice(0, ROW_TITLE_MAX),
    description: `From ₹${r.price}/night · up to ${r.capacity} guest${r.capacity === 1 ? "" : "s"}`.slice(0, ROW_DESCRIPTION_MAX),
  }));
  return {
    type: "list",
    body: "Here's everything we've got — tap a room to hear more about it:",
    buttonText: "See rooms",
    sections: [{ rows }],
  };
}
