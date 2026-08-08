-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'INTERACTIVE';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "interactiveId" TEXT;
