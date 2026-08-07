-- CreateEnum
CREATE TYPE "CampaignSendPacing" AS ENUM ('ALL_AT_ONCE', 'SPACED');

-- AlterEnum
ALTER TYPE "CampaignRecipientStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "sendIntervalSeconds" INTEGER,
ADD COLUMN     "sendPacing" "CampaignSendPacing" NOT NULL DEFAULT 'ALL_AT_ONCE';
