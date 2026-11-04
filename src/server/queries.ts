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
  missingPhoto?: boolean;
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
      ...(opts.missingPhoto ? { photos: { none: {} } } : {}),
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

// ---------------------------------------------------------------- boxes

const itemForBox = {
  include: {
    photos: mainPhoto,
    companies: { include: { company: { select: { name: true } } } },
  },
} as const;

export async function boxDetail(id: number) {
  return db.box.findUnique({
    where: { id },
    include: {
      location: true,
      origin: true,
      destination: true,
      event: { select: { id: true, name: true, venueId: true, wrappedUpAt: true } },
      holdings: { include: { item: itemForBox }, orderBy: { item: { name: "asc" } } },
      barcodes: { orderBy: { id: "desc" } },
      photos: { orderBy: { id: "desc" }, take: 1 },
    },
  });
}

/** Boxes at a location with a preview of their contents. */
export function boxesAtLocation(locationId: number) {
  return db.box.findMany({
    where: { locationId, deletedAt: null },
    include: {
      holdings: {
        include: { item: { include: { photos: mainPhoto, companies: { select: { companyId: true } } } } },
        orderBy: { quantity: "desc" },
      },
    },
    orderBy: { id: "desc" },
  });
}

/** Boxes on the move, with their newest waybill for tracking. */
export function boxesInTransit() {
  return db.box.findMany({
    where: { status: "IN_TRANSIT", deletedAt: null },
    include: {
      origin: true,
      destination: true,
      barcodes: { where: { type: "DHL_WAYBILL" }, orderBy: { id: "desc" }, take: 1 },
      _count: { select: { holdings: true } },
    },
    orderBy: { id: "asc" },
  });
}

/** Every box that still exists, for pickers ("link to an existing box", quick-add). */
export function activeBoxes() {
  return db.box.findMany({
    where: { deletedAt: null },
    include: { location: true, destination: true },
    orderBy: { id: "desc" },
  });
}

/** Boxes whose code or a linked barcode matches the search text. */
export async function searchBoxes(q: string, locationId?: number) {
  const text = q.trim();
  if (!text) return [];
  const digits = /^(?:BOX[-\s]*)?0*(\d{1,9})$/i.exec(text)?.[1];
  const normalised = text.replace(/[\s()[\]{}]/g, "").toUpperCase().replace(/^JJD/, "JD");
  return db.box.findMany({
    where: {
      deletedAt: null,
      ...(locationId ? { locationId } : {}),
      OR: [
        ...(digits ? [{ id: Number(digits) }] : []),
        ...(normalised.length >= 4 ? [{ barcodes: { some: { value: { contains: normalised } } } }] : []),
      ],
    },
    include: { location: true, destination: true, _count: { select: { holdings: true } } },
    take: 20,
  });
}

// ---------------------------------------------------------------- warnings

export type LowStockItem = { id: number; name: string; threshold: number; total: number; photoKey: string | null };

/** Active items whose total quantity (everywhere, incl. in transit) is below their warning level. */
export async function lowStockItems(client = db): Promise<LowStockItem[]> {
  const rows = await client.$queryRaw<{ id: number; name: string; threshold: number; total: bigint; photo_key: string | null }[]>`
    SELECT i.id, i.name, i."lowStockThreshold" AS threshold,
      COALESCE(SUM(h.quantity) FILTER (WHERE b.id IS NULL OR b."deletedAt" IS NULL), 0) AS total,
      (SELECT p.key FROM "Photo" p WHERE p."itemId" = i.id ORDER BY p.position LIMIT 1) AS photo_key
    FROM "Item" i
    LEFT JOIN "Holding" h ON h."itemId" = i.id
    LEFT JOIN "Box" b ON b.id = h."boxId"
    WHERE i."archivedAt" IS NULL AND i."lowStockThreshold" IS NOT NULL
    GROUP BY i.id
    HAVING COALESCE(SUM(h.quantity) FILTER (WHERE b.id IS NULL OR b."deletedAt" IS NULL), 0) < i."lowStockThreshold"
    ORDER BY i.name`;
  return rows.map((r) => ({ id: r.id, name: r.name, threshold: r.threshold, total: Number(r.total), photoKey: r.photo_key }));
}

export function countMissingPhotos(client = db) {
  return client.item.count({ where: { archivedAt: null, photos: { none: {} } } });
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

// ---------------------------------------------------------------- events

/** All events with what's needed for the list (packing progress, box count). */
export async function eventsList() {
  const events = await db.event.findMany({
    include: {
      venue: true,
      lines: { select: { itemId: true, quantity: true } },
      boxes: { where: { deletedAt: null }, select: { id: true, holdings: { select: { itemId: true, quantity: true } } } },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  return events.map((e) => {
    const packed = new Map<number, number>();
    for (const b of e.boxes) for (const h of b.holdings) packed.set(h.itemId, (packed.get(h.itemId) ?? 0) + h.quantity);
    return {
      id: e.id,
      name: e.name,
      venue: e.venue,
      startDate: e.startDate,
      endDate: e.endDate,
      wrappedUpAt: e.wrappedUpAt,
      boxCount: e.boxes.length,
      lineCount: e.lines.length,
      linesDone: e.lines.filter((l) => (packed.get(l.itemId) ?? 0) >= l.quantity).length,
    };
  });
}

export async function eventDetail(id: number) {
  return db.event.findUnique({
    where: { id },
    include: {
      venue: true,
      lines: { include: { item: itemForBox }, orderBy: { item: { name: "asc" } } },
      boxes: {
        where: { deletedAt: null },
        include: {
          location: true,
          origin: true,
          destination: true,
          holdings: { include: { item: itemForBox }, orderBy: { item: { name: "asc" } } },
          barcodes: { where: { type: "DHL_WAYBILL" }, orderBy: { id: "desc" }, take: 1 },
        },
        orderBy: { id: "asc" },
      },
    },
  });
}

/** Loose stock of the given items at every active location (for "Pack for this event"). */
export async function looseStockOf(itemIds: number[]) {
  return db.holding.findMany({
    where: { itemId: { in: itemIds }, locationId: { not: null }, location: { archivedAt: null } },
    select: { itemId: true, quantity: true, locationId: true },
  });
}

/**
 * Where each box came from on its last trip to `locationId` — the default
 * "send it back to" choice in the event wrap-up.
 */
export async function lastShippedFrom(boxIds: number[], locationId: number): Promise<Map<number, number>> {
  if (boxIds.length === 0) return new Map();
  const rows = await db.historyEntry.findMany({
    where: { action: "SHIPPED", boxId: { in: boxIds }, toLocationId: locationId, fromLocationId: { not: null } },
    select: { boxId: true, fromLocationId: true },
    orderBy: { id: "desc" },
  });
  const out = new Map<number, number>();
  for (const r of rows) if (r.boxId && r.fromLocationId && !out.has(r.boxId)) out.set(r.boxId, r.fromLocationId);
  return out;
}

/** Events that haven't been wrapped up yet, soonest first (home page). */
export function openEvents(take = 4) {
  return db.event.findMany({
    where: { wrappedUpAt: null },
    include: { venue: true, _count: { select: { boxes: { where: { deletedAt: null } } } } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    take,
  });
}
