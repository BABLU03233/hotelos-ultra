-- Attachments sent from the CRM, and the reason a send failed.
--
-- All additive and all nullable: existing rows keep working untouched, and
-- the columns are only populated going forward.

-- Meta's media id. No object storage is configured in this deployment, so for
-- an attachment this is the only handle on the bytes.
ALTER TABLE "Message" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaMimeType" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaFilename" TEXT;

-- Why a send failed. Meta accepts a doomed request with a 200 and a message
-- id, then reports the real outcome asynchronously via the status webhook's
-- errors[] — which was previously discarded, leaving staff with a failure
-- icon and no cause.
ALTER TABLE "Message" ADD COLUMN "errorCode" INTEGER;
ALTER TABLE "Message" ADD COLUMN "errorTitle" TEXT;
