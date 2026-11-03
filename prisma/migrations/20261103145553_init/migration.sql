-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('STORAGE', 'VENUE');

-- CreateEnum
CREATE TYPE "BoxStatus" AS ENUM ('AT_LOCATION', 'IN_TRANSIT');

-- CreateEnum
CREATE TYPE "BarcodeType" AS ENUM ('DHL_PIECE', 'DHL_WAYBILL', 'OTHER');

-- CreateEnum
CREATE TYPE "HistoryAction" AS ENUM ('ITEM_CREATED', 'ITEM_EDITED', 'ITEM_ARCHIVED', 'ITEM_RESTORED', 'PHOTO_ADDED', 'PHOTO_REMOVED', 'STOCK_ADDED', 'QUANTITY_ADJUSTED', 'BOX_CREATED', 'BOX_EDITED', 'PACKED', 'UNPACKED', 'SHIPPED', 'ARRIVED', 'BOX_DELETED', 'BARCODE_LINKED', 'LOCATION_CREATED', 'LOCATION_EDITED', 'LOCATION_ARCHIVED', 'LOCATION_RESTORED', 'COMPANY_CREATED', 'COMPANY_RENAMED', 'COMPANY_ARCHIVED', 'COMPANY_RESTORED', 'COMPANY_DELETED', 'USER_CHANGED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lowStockThreshold" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCompany" (
    "itemId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "ItemCompany_pkey" PRIMARY KEY ("itemId","companyId")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "itemId" INTEGER,
    "boxId" INTEGER,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Box" (
    "id" SERIAL NOT NULL,
    "status" "BoxStatus" NOT NULL DEFAULT 'AT_LOCATION',
    "locationId" INTEGER,
    "originId" INTEGER,
    "destinationId" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barcode" (
    "id" SERIAL NOT NULL,
    "boxId" INTEGER NOT NULL,
    "type" "BarcodeType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "boxId" INTEGER,
    "locationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "userName" TEXT NOT NULL,
    "action" "HistoryAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "itemId" INTEGER,
    "boxId" INTEGER,
    "locationId" INTEGER,
    "fromLocationId" INTEGER,
    "toLocationId" INTEGER,
    "companyId" INTEGER,
    "quantity" INTEGER,
    "quantityBefore" INTEGER,
    "quantityAfter" INTEGER,
    "reason" TEXT,
    "note" TEXT,

    CONSTRAINT "HistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedRequest" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" JSONB NOT NULL,

    CONSTRAINT "ProcessedRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "Item"("name");

-- CreateIndex
CREATE INDEX "ItemCompany_companyId_idx" ON "ItemCompany"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_key_key" ON "Photo"("key");

-- CreateIndex
CREATE INDEX "Photo_itemId_position_idx" ON "Photo"("itemId", "position");

-- CreateIndex
CREATE INDEX "Photo_boxId_idx" ON "Photo"("boxId");

-- CreateIndex
CREATE INDEX "Box_locationId_idx" ON "Box"("locationId");

-- CreateIndex
CREATE INDEX "Barcode_value_idx" ON "Barcode"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_boxId_value_key" ON "Barcode"("boxId", "value");

-- CreateIndex
CREATE INDEX "Holding_boxId_idx" ON "Holding"("boxId");

-- CreateIndex
CREATE INDEX "Holding_locationId_idx" ON "Holding"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_itemId_boxId_key" ON "Holding"("itemId", "boxId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_itemId_locationId_key" ON "Holding"("itemId", "locationId");

-- CreateIndex
CREATE INDEX "HistoryEntry_itemId_createdAt_idx" ON "HistoryEntry"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryEntry_boxId_createdAt_idx" ON "HistoryEntry"("boxId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryEntry_locationId_createdAt_idx" ON "HistoryEntry"("locationId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryEntry_fromLocationId_idx" ON "HistoryEntry"("fromLocationId");

-- CreateIndex
CREATE INDEX "HistoryEntry_toLocationId_idx" ON "HistoryEntry"("toLocationId");

-- CreateIndex
CREATE INDEX "HistoryEntry_createdAt_idx" ON "HistoryEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompany" ADD CONSTRAINT "ItemCompany_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompany" ADD CONSTRAINT "ItemCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma can't express. These protect stock data even if app code has a bug.
-- ---------------------------------------------------------------------------

-- A holding is either inside a box or loose at a location, never both or neither.
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_box_xor_location"
  CHECK (num_nonnulls("boxId", "locationId") = 1);

-- Quantities are always positive; a holding that reaches 0 is deleted.
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_quantity_positive"
  CHECK ("quantity" > 0);

-- A DHL piece ID (or other unique barcode) belongs to exactly one box.
-- Waybills are shared by all boxes in a shipment, so they are excluded.
CREATE UNIQUE INDEX "Barcode_unique_value_except_waybill"
  ON "Barcode" ("value") WHERE "type" <> 'DHL_WAYBILL';

-- Low-stock thresholds can't be negative.
ALTER TABLE "Item" ADD CONSTRAINT "Item_lowStockThreshold_nonnegative"
  CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0);
