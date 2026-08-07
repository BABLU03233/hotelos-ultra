-- CreateEnum
CREATE TYPE "StaffNotificationType" AS ENUM ('ESCALATION', 'BOOKING', 'REMINDER');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "followUpNote" TEXT;

-- AlterTable
ALTER TABLE "StaffNotification" ADD COLUMN     "type" "StaffNotificationType" NOT NULL DEFAULT 'ESCALATION';
