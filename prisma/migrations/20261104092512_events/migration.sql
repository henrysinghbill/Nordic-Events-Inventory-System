-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'EVENT_CREATED';
ALTER TYPE "HistoryAction" ADD VALUE 'EVENT_EDITED';
ALTER TYPE "HistoryAction" ADD VALUE 'EVENT_DELETED';
ALTER TYPE "HistoryAction" ADD VALUE 'EVENT_WRAPPED_UP';
ALTER TYPE "HistoryAction" ADD VALUE 'DHL_DELIVERED';

-- AlterTable
ALTER TABLE "Box" ADD COLUMN     "dhlCheckedAt" TIMESTAMP(3),
ADD COLUMN     "dhlDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "dhlStatus" TEXT,
ADD COLUMN     "dhlStatusText" TEXT,
ADD COLUMN     "eventId" INTEGER;

-- AlterTable
ALTER TABLE "HistoryEntry" ADD COLUMN     "eventId" INTEGER;

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "venueId" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "notes" TEXT,
    "wrappedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventItem" (
    "eventId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "EventItem_pkey" PRIMARY KEY ("eventId","itemId")
);

-- CreateIndex
CREATE INDEX "Event_startDate_idx" ON "Event"("startDate");

-- CreateIndex
CREATE INDEX "Box_eventId_idx" ON "Box"("eventId");

-- CreateIndex
CREATE INDEX "HistoryEntry_eventId_createdAt_idx" ON "HistoryEntry"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItem" ADD CONSTRAINT "EventItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventItem" ADD CONSTRAINT "EventItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma can't express
ALTER TABLE "EventItem" ADD CONSTRAINT "EventItem_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "Event" ADD CONSTRAINT "Event_dates_order" CHECK ("endDate" >= "startDate");
