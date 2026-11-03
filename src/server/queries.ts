import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

/** Read-only data loading for pages. All changes live in stock/, items.ts and the actions. */

export function activeCompanies() {
  return db.company.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
}

export function activeLocations() {
  return db.location.findMany({ where: { archivedAt: null }, orderBy: [{ type: "asc" }, { name: "asc" }] });
}

export type LocationOverview = {
  id: number;
  name: string;
  country: string;
  type: "STORAGE" | "VENUE";
  itemCount: number;
  pieceCount: number;
  boxCount: number;
};

/** Each active location with how many different items, pieces and boxes are there. */
export async function locationsOverview(): Promise<LocationOverview[]> {
  const rows = await db.$queryRaw<
    { id: number; name: string; country: string; type: "STORAGE" | "VENUE"; item_count: bigint; piece_count: bigint; box_count: bigint }[]
  >`
    WITH here AS (
      SELECT COALESCE(h."locationId", b."locationId") AS location_id, h."itemId", h.quantity
      FROM "Holding" h
      LEFT JOIN "Box" b ON b.id = h."boxId"
      WHERE h."locationId" IS NOT NULL OR (b."deletedAt" IS NULL AND b."locationId" IS NOT NULL)
    )
    SELECT l.id, l.name, l.country, l.type,
      (SELECT COUNT(DISTINCT "itemId") FROM here WHERE location_id = l.id) AS item_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM here WHERE location_id = l.id) AS piece_count,
      (SELECT COUNT(*) FROM "Box" b WHERE b."locationId" = l.id AND b."deletedAt" IS NULL) AS box_count
    FROM "Location" l
    WHERE l."archivedAt" IS NULL
    ORDER BY l.type, l.name`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    type: r.type,
    itemCount: Number(r.item_count),
    pieceCount: Number(r.piece_count),
    boxCount: Number(r.box_count),
  }));
}

const mainPhoto = { orderBy: { position: "asc" }, take: 1, select: { key: true } } as const;

export type ItemCard = {
  id: number;
  name: string;
  archived: boolean;
  photoKey: string | null;
  companies: string[];
  quantity: number;
};

/**
 * Item search: name contains the query (case-insensitive), optional company
 * and location filters. Quantity is the total, or only what's at the chosen
 * location when one is selected.
 */
export async function searchItems(opts: {
  q?: string;
  companyId?: number;
  locationId?: number;
  includeArchived?: boolean;
  take?: number;
}): Promise<ItemCard[]> {
  const atLocation: Prisma.HoldingWhereInput | undefined = opts.locationId
    ? { OR: [{ locationId: opts.locationId }, { box: { locationId: opts.locationId, deletedAt: null } }] }
    : undefined;
  const items = await db.item.findMany({
    where: {
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.q ? { name: { contains: opts.q.trim(), mode: "insensitive" } } : {}),
      ...(opts.companyId ? { companies: { some: { companyId: opts.companyId } } } : {}),
      ...(atLocation ? { holdings: { some: atLocation } } : {}),
    },
    include: {
      photos: mainPhoto,
      companies: { include: { company: { select: { name: true } } } },
      holdings: { where: atLocation ?? {}, select: { quantity: true } },
    },
    orderBy: { name: "asc" },
    take: opts.take ?? 200,
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    archived: Boolean(i.archivedAt),
    photoKey: i.photos[0]?.key ?? null,
    companies: i.companies.map((c) => c.company.name).sort(),
    quantity: i.holdings.reduce((sum, h) => sum + h.quantity, 0),
  }));
}

export async function itemDetail(id: number) {
  return db.item.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { position: "asc" } },
      companies: { include: { company: true }, orderBy: { company: { name: "asc" } } },
      holdings: {
        include: {
          location: true,
          box: { include: { location: true, destination: true, origin: true } },
        },
        orderBy: { quantity: "desc" },
      },
    },
  });
}

export async function locationDetail(id: number, companyId?: number) {
  const location = await db.location.findUnique({ where: { id } });
  if (!location) return null;
  const companyFilter = companyId ? { item: { companies: { some: { companyId } } } } : {};
  const loose = await db.holding.findMany({
    where: { locationId: id, ...companyFilter },
    include: {
      item: {
        include: {
          photos: mainPhoto,
          companies: { include: { company: { select: { name: true } } } },
        },
      },
    },
    orderBy: { item: { name: "asc" } },
  });
  return { location, loose };
}

export function history(where: Prisma.HistoryEntryWhereInput, take = 50) {
  return db.historyEntry.findMany({ where, orderBy: { id: "desc" }, take });
}

/** Items whose names match, for "add to the existing item?" while typing. */
export function itemNameMatches(q: string, take = 6) {
  return db.item.findMany({
    where: { archivedAt: null, name: { contains: q.trim(), mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      photos: mainPhoto,
      companies: { select: { companyId: true } },
    },
    orderBy: { name: "asc" },
    take,
  });
}
