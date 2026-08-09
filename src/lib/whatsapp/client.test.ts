import { describe, expect, it } from "vitest";
import { buildPayload } from "./client";

describe("buildPayload", () => {
  it("builds a reply-button interactive payload", () => {
    const payload = buildPayload("919876543210", {
      type: "interactive",
      body: "How many guests?",
      buttons: [
        { id: "guests_1", title: "Just me" },
        { id: "guests_2", title: "2 guests" },
      ],
    });
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "How many guests?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "guests_1", title: "Just me" } },
            { type: "reply", reply: { id: "guests_2", title: "2 guests" } },
          ],
        },
      },
    });
  });

  it("builds a list-message payload with sections/rows", () => {
    const payload = buildPayload("919876543210", {
      type: "list",
      body: "Here's what we've got:",
      buttonText: "See rooms",
      sections: [
        {
          title: "Rooms",
          rows: [
            { id: "room_classic", title: "Classic Room", description: "₹999/night" },
            { id: "room_premium", title: "Premium Room", description: "₹1,599/night" },
          ],
        },
      ],
    });
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "Here's what we've got:" },
        action: {
          button: "See rooms",
          sections: [
            {
              title: "Rooms",
              rows: [
                { id: "room_classic", title: "Classic Room", description: "₹999/night" },
                { id: "room_premium", title: "Premium Room", description: "₹1,599/night" },
              ],
            },
          ],
        },
      },
    });
  });

  it("builds a list-message payload across multiple sections", () => {
    const payload = buildPayload("919876543210", {
      type: "list",
      body: "Pick a category",
      buttonText: "Browse",
      sections: [
        { title: "Rooms", rows: [{ id: "r1", title: "Classic" }] },
        { title: "Offers", rows: [{ id: "o1", title: "Weekend deal" }] },
      ],
    });
    const interactive = (payload.interactive as { action: { sections: unknown[] } }).action.sections;
    expect(interactive).toHaveLength(2);
  });

  it("builds a flow interactive payload with a generated flow_token", () => {
    const payload = buildPayload("919876543210", {
      type: "flow",
      body: "Let's get you booked:",
      flowId: "123456789",
      flowCta: "Book now",
      screen: "BOOKING",
    });
    expect(payload).toMatchObject({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "interactive",
      interactive: {
        type: "flow",
        body: { text: "Let's get you booked:" },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_id: "123456789",
            flow_cta: "Book now",
            flow_action: "navigate",
            flow_action_payload: { screen: "BOOKING", data: {} },
          },
        },
      },
    });
    const params = (payload.interactive as { action: { parameters: { flow_token: string } } }).action.parameters;
    expect(typeof params.flow_token).toBe("string");
    expect(params.flow_token.length).toBeGreaterThan(0);
  });

  it("still builds a plain text payload", () => {
    const payload = buildPayload("919876543210", { type: "text", text: "Hi there" });
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "text",
      text: { body: "Hi there" },
    });
  });
});
