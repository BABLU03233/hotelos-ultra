/**
 * WhatsApp Flow JSON for a one-tap booking form: room dropdown, a real
 * native date-range calendar, guest-count dropdown, single terminal screen
 * (no extra confirm step — matches this product's minimal-friction
 * philosophy). This is a STATIC flow (no `routing_model`/`data_api_version`,
 * no hosted endpoint) -- the room list is a snapshot taken at publish time,
 * not live; real-time availability is still checked server-side the moment
 * the guest submits (see attemptBookingCompletion in handle-inbound-message.ts),
 * exactly the same safety net the button-based flow already has.
 *
 * The exact submitted shape of a range-mode CalendarPicker's value hasn't
 * been confirmed against a real payload yet (Meta's docs describe the
 * component but not its exact `${form.*}` field/value shape) -- the raw
 * form value is passed through unparsed in the completion payload here, and
 * parsed defensively on the receiving end once a real submission can be
 * observed (see parseFlowBookingResponse in handle-inbound-message.ts).
 */
export function buildBookingFlowJson(rooms: { id: string; name: string; price: number }[], now: Date = new Date()): object {
  const minDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return {
    version: "7.1",
    screens: [
      {
        id: "BOOKING",
        title: "Book a room",
        terminal: true,
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "Dropdown",
              name: "room",
              label: "Which room?",
              required: true,
              "data-source": rooms.map((r) => ({ id: r.id, title: `${r.name} — from ₹${r.price}/night` })),
            },
            {
              type: "CalendarPicker",
              name: "date_range",
              label: "Your dates",
              mode: "range",
              "min-date": minDate,
              "min-days": 1,
              required: true,
            },
            {
              type: "Dropdown",
              name: "guests",
              label: "How many people?",
              required: true,
              "data-source": [
                { id: "1", title: "Just me" },
                { id: "2", title: "2 people" },
                { id: "3+", title: "3+ people" },
              ],
            },
            {
              type: "Footer",
              label: "Book now",
              "on-click-action": {
                name: "complete",
                payload: {
                  room: "${form.room}",
                  date_range: "${form.date_range}",
                  guests: "${form.guests}",
                },
              },
            },
          ],
        },
      },
    ],
  };
}
