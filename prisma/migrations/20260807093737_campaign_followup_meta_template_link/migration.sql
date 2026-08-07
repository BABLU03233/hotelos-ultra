-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "metaTemplateId" TEXT,
ADD COLUMN     "templateVariableValues" JSONB;

-- AlterTable
ALTER TABLE "FollowUpRule" ADD COLUMN     "metaTemplateId" TEXT,
ADD COLUMN     "templateVariableValues" JSONB;

-- AddForeignKey
ALTER TABLE "FollowUpRule" ADD CONSTRAINT "FollowUpRule_metaTemplateId_fkey" FOREIGN KEY ("metaTemplateId") REFERENCES "MetaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_metaTemplateId_fkey" FOREIGN KEY ("metaTemplateId") REFERENCES "MetaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
