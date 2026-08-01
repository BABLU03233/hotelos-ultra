-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('DIRECT', 'META_AD', 'COLD_IMPORT');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "ctwaClid" TEXT,
ADD COLUMN     "leadSource" "LeadSource" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "sourceDetail" TEXT;

-- CreateIndex
CREATE INDEX "Contact_tenantId_leadSource_idx" ON "Contact"("tenantId", "leadSource");
