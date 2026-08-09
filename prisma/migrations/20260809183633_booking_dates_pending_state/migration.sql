-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "checkIn" TIMESTAMP(3),
ADD COLUMN     "checkOut" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "pendingCheckIn" TIMESTAMP(3),
ADD COLUMN     "pendingCheckOut" TIMESTAMP(3),
ADD COLUMN     "pendingRoomId" TEXT;

-- AlterTable
ALTER TABLE "Faq" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Booking_roomId_checkIn_checkOut_idx" ON "Booking"("roomId", "checkIn", "checkOut");
