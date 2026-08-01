-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "lastReadAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Contact_assignedToId_idx" ON "Contact"("assignedToId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
