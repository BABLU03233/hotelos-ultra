import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { handleInboundMessage, handleStatusUpdate } from "@/lib/inbound/handle-inbound-message";
import { parseWebhookPayload, verifyWebhookSignature } from "@/lib/whatsapp/webhook";

/** Meta's one-time webhook verification handshake, done when you paste this URL into the App dashboard. */
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Inbound messages + status callbacks for every tenant's WABA (one Meta App
 * fronts all of them — see prisma/schema.prisma). Only the fast, durable
 * part (persist message, upsert contact, enqueue) happens here; the AI
 * reply itself runs in the message-processing worker (src/worker/index.ts)
 * so a slow LLM call can never cause Meta to see a timeout and retry.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      throw new ApiError(401, "Invalid webhook signature");
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new ApiError(500, "WHATSAPP_APP_SECRET is not configured");
  }

  const payload = JSON.parse(rawBody);
  const { messages, statuses } = parseWebhookPayload(payload);

  const results = await Promise.allSettled([...messages.map(handleInboundMessage), ...statuses.map(handleStatusUpdate)]);
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  for (const result of rejected) {
    console.error("Webhook event handling failed:", result.reason);
  }

  // Process every event in the batch, but do not acknowledge the batch when
  // any durable handler failed. Meta retries a non-2xx response, and the
  // status handler is idempotent so the retry is safe.
  if (rejected.length) {
    throw new Error(`Failed to persist ${rejected.length} WhatsApp webhook event${rejected.length === 1 ? "" : "s"}`);
  }

  return NextResponse.json({ received: true });
});
