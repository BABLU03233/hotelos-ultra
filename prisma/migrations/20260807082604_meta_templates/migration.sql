-- CreateEnum
CREATE TYPE "MetaTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateTable
CREATE TABLE "MetaTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MetaTemplateCategory" NOT NULL DEFAULT 'MARKETING',
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "metaTemplateId" TEXT,
    "components" JSONB NOT NULL,
    "headerType" TEXT,
    "headerMediaUrl" TEXT,
    "bodyVariableSlots" JSONB NOT NULL DEFAULT '[]',
    "lastStatusCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaTemplate_tenantId_status_idx" ON "MetaTemplate"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MetaTemplate_tenantId_name_language_key" ON "MetaTemplate"("tenantId", "name", "language");

-- AddForeignKey
ALTER TABLE "MetaTemplate" ADD CONSTRAINT "MetaTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
