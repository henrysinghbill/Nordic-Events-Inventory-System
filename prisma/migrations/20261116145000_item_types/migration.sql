-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'TYPE_CREATED';
ALTER TYPE "HistoryAction" ADD VALUE 'TYPE_RENAMED';
ALTER TYPE "HistoryAction" ADD VALUE 'TYPE_DELETED';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "typeId" INTEGER;

-- CreateTable
CREATE TABLE "ItemType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_name_key" ON "ItemType"("name");

-- CreateIndex
CREATE INDEX "Item_typeId_idx" ON "Item"("typeId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ItemType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules Prisma can't express
-- Type names are unique whatever the capitals, so "Banner" and "banner" can't both exist.
CREATE UNIQUE INDEX "ItemType_name_lower_key" ON "ItemType" (lower("name"));
