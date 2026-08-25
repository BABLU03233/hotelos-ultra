-- Correlate each campaign outbound message with its exact recipient and
-- remember the Meta callback timestamp for stale status protection.
ALTER TABLE "Message" ADD COLUMN "campaignRecipientId" TEXT;
ALTER TABLE "Message" ADD COLUMN "whatsappStatusAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Message_campaignRecipientId_key" ON "Message"("campaignRecipientId");

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_campaignRecipientId_fkey"
  FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
