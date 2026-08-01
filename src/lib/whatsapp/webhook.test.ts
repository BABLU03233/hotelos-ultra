import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { parseWebhookPayload, verifyWebhookSignature } from "./webhook";

const APP_SECRET = "test-app-secret";

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyWebhookSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    const wrongSignature = "sha256=" + createHmac("sha256", "wrong-secret").update(body, "utf8").digest("hex");
    expect(verifyWebhookSignature(body, wrongSignature, APP_SECRET)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const original = JSON.stringify({ hello: "world" });
    const signature = sign(original);
    const tampered = JSON.stringify({ hello: "mallory" });
    expect(verifyWebhookSignature(tampered, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature("{}", null, APP_SECRET)).toBe(false);
  });
});

describe("parseWebhookPayload", () => {
  it("extracts an inbound text message with the routing phone_number_id", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "PHONE_123" },
                contacts: [{ profile: { name: "Ananya" }, wa_id: "919876543210" }],
                messages: [
                  {
                    from: "919876543210",
                    id: "wamid.ABC123",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "Do you have rooms for 2 adults on the 12th?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const { messages, statuses } = parseWebhookPayload(payload);

    expect(statuses).toHaveLength(0);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      phoneNumberId: "PHONE_123",
      waId: "919876543210",
      contactName: "Ananya",
      whatsappMessageId: "wamid.ABC123",
      type: "text",
      text: "Do you have rooms for 2 adults on the 12th?",
      mediaId: null,
    });
  });

  it("extracts an inbound image message's media id instead of text", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_123" },
                messages: [
                  {
                    from: "919876543210",
                    id: "wamid.IMG1",
                    timestamp: "1700000000",
                    type: "image",
                    image: { id: "media-abc", mime_type: "image/jpeg" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const { messages } = parseWebhookPayload(payload);
    expect(messages[0]).toMatchObject({ type: "image", text: null, mediaId: "media-abc", mediaMimeType: "image/jpeg" });
  });

  it("extracts status callbacks", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_123" },
                statuses: [{ id: "wamid.OUT1", status: "delivered", timestamp: "1700000001" }],
              },
            },
          ],
        },
      ],
    };

    const { statuses, messages } = parseWebhookPayload(payload);
    expect(messages).toHaveLength(0);
    expect(statuses).toEqual([
      { phoneNumberId: "PHONE_123", whatsappMessageId: "wamid.OUT1", status: "delivered", timestamp: "1700000001" },
    ]);
  });

  it("ignores entries with no metadata.phone_number_id", () => {
    const payload = { entry: [{ changes: [{ value: { messages: [{ id: "x", type: "text" }] } }] }] };
    const { messages } = parseWebhookPayload(payload);
    expect(messages).toHaveLength(0);
  });

  it("extracts a Click-to-WhatsApp ad referral when present", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_123" },
                messages: [
                  {
                    from: "919876543210",
                    id: "wamid.AD1",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "Hi, I saw your ad" },
                    referral: {
                      source_url: "https://fb.me/ad123",
                      headline: "Weekend Getaway Offer",
                      ctwa_clid: "clid-abc",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const { messages } = parseWebhookPayload(payload);
    expect(messages[0].referral).toEqual({
      headline: "Weekend Getaway Offer",
      sourceUrl: "https://fb.me/ad123",
      ctwaClid: "clid-abc",
    });
  });

  it("leaves referral null for an ordinary organic message", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_123" },
                messages: [{ from: "919876543210", id: "wamid.ORG1", timestamp: "1700000000", type: "text", text: { body: "Hi" } }],
              },
            },
          ],
        },
      ],
    };

    const { messages } = parseWebhookPayload(payload);
    expect(messages[0].referral).toBeNull();
  });
});
