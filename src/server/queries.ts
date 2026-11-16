import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { interpretScan } from "@/lib/barcodes";
import { initials } from "@/lib/company-match";
import { matchesAll, searchTerms, type SearchTerm } from "@/lib/search-text";
import { whereSummary } from "@/lib/where";
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

const contains = (text: string) => ({ contains: text, mode: "insensitive" as const });

/** Stock that still counts: loose, or in a box that hasn't been discarded. */
const liveHolding: Prisma.HoldingWhereInput = { OR: [{ boxId: null }, { box: { deletedAt: null } }] };

/**
 * One condition per typed word: the word has to appear in the item's name,
 * description, type or a company name. Company initials work too ("FF", "NL"),
 * as they do in bulk entry.
 */
function itemTextWhere(terms: SearchTerm[], companies: { id: number; name: string }[]): Prisma.ItemWhereInput[] {
  return terms.map(({ word, stem }) => {
    const byInitials = word.length >= 2 ? companies.filter((c) => initials(c.name) === word).map((c) => c.id) : [];
    return {
      OR: [
        { name: contains(stem) },
        { description: contains(stem) },
        { type: { name: contains(stem) } },
        { companies: { some: { company: { name: contains(stem) } } } },
        ...(byInitials.length ? [{ companies: { some: { companyId: { in: byInitials } } } }] : []),
      ],
    };
  });
}

export type ItemCard = {
  id: number;
  name: string;
  archived: boolean;
  photoKey: string | null;
  type: string | null;
  companies: string[];
  quantity: number;
  /** Where the stock is, in a few words ("BOX-0012 · Copenhagen storeroom", "3 places"); null if there is none. */
  where: string | null;
};

export type StockFilter = "in" | "low" | "out";

export type ItemSearch = {
  /** Typed text: every word must match the name, description, type or a company. */
  q?: string;
  typeId?: number;
  /** Only items that have no type yet. */
  noType?: boolean;
  companyId?: number;
  locationId?: number;
  /** in = something in stock, out = nothing in stock, low = below the item's low-stock level. */
  stock?: StockFilter;
  includeArchived?: boolean;
  missingPhoto?: boolean;
  take?: number;
};

/**
 * The item list with its search and filters. Quantity and "where" cover
 * everywhere, or only the chosen location when one is selected. Items whose
 * name matches come before those found through their description, type or
 * company. `more` is true when there were more matches than `take`.
 */
export async function searchItems(opts: ItemSearch, client = db): Promise<{ items: ItemCard[]; more: boolean }> {
  const limit = opts.take ?? 500;
  const terms = searchTerms(opts.q ?? "");
  const companies = terms.length ? await client.company.findMany({ select: { id: true, name: true } }) : [];
  const atLocation: Prisma.HoldingWhereInput | undefined = opts.locationId
    ? { OR: [{ locationId: opts.locationId }, { box: { locationId: opts.locationId, deletedAt: null } }] }
    : undefined;

  const and: Prisma.ItemWhereInput[] = itemTextWhere(terms, companies);
  if (!opts.includeArchived) and.push({ archivedAt: null });
  if (opts.noType) and.push({ typeId: null });
  else if (opts.typeId) and.push({ typeId: opts.typeId });
  if (opts.companyId) and.push({ companies: { some: { companyId: opts.companyId } } });
  if (atLocation) and.push({ holdings: { some: atLocation } });
  if (opts.missingPhoto) and.push({ photos: { none: {} } });
  if (opts.stock === "in") and.push({ holdings: { some: liveHolding } });
  if (opts.stock === "out") and.push({ holdings: { none: liveHolding } });
  if (opts.stock === "low") and.push({ id: { in: (await lowStockItems(client)).map((i) => i.id) } });

  const rows = await client.item.findMany({
    where: { AND: and },
    include: {
      photos: mainPhoto,
      type: { select: { name: true } },
      companies: { include: { company: { select: { name: true } } } },
      holdings: {
        where: atLocation ?? liveHolding,
        select: {
          quantity: true,
          location: { select: { name: true } },
          box: { select: { id: true, location: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const more = rows.length > limit;
  const shown = rows.slice(0, limit);
  // Name matches first; the sort is stable, so each group stays in name order.
  if (terms.length) shown.sort((a, b) => Number(!matchesAll(a.name, terms)) - Number(!matchesAll(b.name, terms)));

  const items = shown.map((i) => ({
    id: i.id,
    name: i.name,
    archived: Boolean(i.archivedAt),
    photoKey: i.photos[0]?.key ?? null,
    type: i.type?.name ?? null,
    companies: i.companies.map((c) => c.company.name).sort(),
    quantity: i.holdings.reduce((sum, h) => sum + h.quantity, 0),
    where: whereSummary(
      i.holdings.map((h) => ({
        location: h.location?.name,
        box: h.box ? { id: h.box.id, location: h.box.location?.name ?? null } : null,
      })),
    ),
  }));
  return { items, more };
}

export async function itemDetail(id: number) {
  return db.item.findUnique({
    where: { id },
    include: {
      type: true,
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
          type: { select: { name: true } },
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
    type: { select: { name: true } },
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

/**
 * Typed text → boxes. A box matches when the text is
 *   - its number ("BOX-0047", "box 47", "47"),
 *   - part of a barcode linked to it (DHL piece ID, waybill, other), or
 *   - words that all appear in its description or in the name or type of something inside it.
 */
function boxTextWhere(text: string): Prisma.BoxWhereInput {
  const digits = /^(?:BOX[-\s]*)?0*(\d{1,9})$/i.exec(text)?.[1];
  const scan = interpretScan(text);
  const barcode = scan.kind === "dhl_piece" || scan.kind === "dhl_waybill" || scan.kind === "other" ? scan.value : "";
  const terms = searchTerms(text);
  const inside = (stem: string): Prisma.BoxWhereInput => ({
    holdings: { some: { item: { OR: [{ name: contains(stem) }, { type: { name: contains(stem) } }] } } },
  });
  return {
    OR: [
      ...(digits ? [{ id: Number(digits) }] : []),
      ...(barcode.length >= 4 ? [{ barcodes: { some: { value: { contains: barcode } } } }] : []),
      ...(terms.length ? [{ AND: terms.map(({ stem }) => ({ OR: [{ description: contains(stem) }, inside(stem)] })) }] : []),
    ],
  };
}

export type BoxSearch = {
  /** Typed text: see boxTextWhere. */
  q?: string;
  locationId?: number;
  /** Only boxes on the move (wins over locationId). */
  inTransit?: boolean;
  eventId?: number;
  take?: number;
};

/** Every box that still exists (lowest number first), with what's inside, for the Boxes list and the search. */
export function boxesList(opts: BoxSearch = {}, client = db) {
  const text = (opts.q ?? "").trim();
  const and: Prisma.BoxWhereInput[] = [];
  if (opts.inTransit) and.push({ status: "IN_TRANSIT" });
  else if (opts.locationId) and.push({ locationId: opts.locationId });
  if (opts.eventId) and.push({ eventId: opts.eventId });
  if (text) and.push(boxTextWhere(text));
  return client.box.findMany({
    where: { deletedAt: null, AND: and },
    include: {
      location: true,
      origin: true,
      destination: true,
      event: { select: { id: true, name: true, wrappedUpAt: true } },
      holdings: {
        include: { item: { include: { photos: mainPhoto } } },
        orderBy: { quantity: "desc" },
      },
    },
    orderBy: { id: "asc" },
    ...(opts.take ? { take: opts.take } : {}),
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

/**
 * Items for the pickers that search as you type.
 *  - Normally every typed word has to be in the name: this is the "already
 *    exists? add stock to it instead" check while adding items.
 *  - `wide` also looks at type, company and description, and `typeId` lists a
 *    whole type: this is for choosing items for an event's packing list.
 */
export async function suggestItems(opts: { q?: string; typeId?: number; wide?: boolean; take?: number }, client = db) {
  const terms = searchTerms(opts.q ?? "");
  if (terms.length === 0 && !opts.typeId) return [];
  const companies =
    opts.wide && terms.length ? await client.company.findMany({ select: { id: true, name: true } }) : [];
  const text: Prisma.ItemWhereInput[] = opts.wide
    ? itemTextWhere(terms, companies)
    : terms.map(({ stem }) => ({ name: contains(stem) }));
  const rows = await client.item.findMany({
    where: { archivedAt: null, ...(opts.typeId ? { typeId: opts.typeId } : {}), AND: text },
    select: {
      id: true,
      name: true,
      photos: mainPhoto,
      type: { select: { name: true } },
      companies: { select: { companyId: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: opts.take ?? 6,
  });
  if (opts.wide && terms.length) rows.sort((a, b) => Number(!matchesAll(a.name, terms)) - Number(!matchesAll(b.name, terms)));
  return rows.map((i) => ({
    id: i.id,
    name: i.name,
    photoKey: i.photos[0]?.key ?? null,
    type: i.type?.name ?? null,
    companyIds: i.companies.map((c) => c.companyId),
  }));
}

// ---------------------------------------------------------------- item types

/** Every item type, A to Z, with how many items have it (archived items included). */
export function itemTypes(client = db) {
  return client.itemType.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: { _count: { select: { items: true } } },
  });
}

/**
 * Which types are in use, for the filter on the Items page.
 *   all     — every type, A to Z
 *   used    — only the types that at least one (non-archived) item has
 *   untyped — how many items have no type
 */
export async function typeUsage(includeArchived = false, client = db) {
  const [groups, all] = await Promise.all([
    client.item.groupBy({
      by: ["typeId"],
      where: includeArchived ? {} : { archivedAt: null },
      _count: { _all: true },
    }),
    client.itemType.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
  ]);
  const counts = new Map(groups.map((g) => [g.typeId, g._count._all]));
  return { all, used: all.filter((t) => counts.has(t.id)), untyped: counts.get(null) ?? 0 };
}

/** Active items that have no type yet, for the "Items without a type" page. */
export async function untypedItems(client = db) {
  const rows = await client.item.findMany({
    where: { archivedAt: null, typeId: null },
    select: {
      id: true,
      name: true,
      photos: mainPhoto,
      companies: { select: { company: { select: { name: true } } } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map((i) => ({
    id: i.id,
    name: i.name,
    photoKey: i.photos[0]?.key ?? null,
    companies: i.companies.map((c) => c.company.name).sort(),
  }));
}

export function countUntyped(client = db) {
  return client.item.count({ where: { archivedAt: null, typeId: null } });
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

/** Events whose name or venue contains every typed word, newest first (search page). */
export async function searchEvents(q: string, take = 8, client = db) {
  const terms = searchTerms(q);
  if (terms.length === 0) return [];
  return client.event.findMany({
    where: { AND: terms.map(({ stem }) => ({ OR: [{ name: contains(stem) }, { venue: { name: contains(stem) } }] })) },
    include: { venue: true },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take,
  });
}

/** Active locations whose name or country contains every typed word (search page). */
export async function searchLocations(q: string, take = 8, client = db) {
  const terms = searchTerms(q);
  if (terms.length === 0) return [];
  return client.location.findMany({
    where: {
      archivedAt: null,
      AND: terms.map(({ stem }) => ({ OR: [{ name: contains(stem) }, { country: contains(stem) }] })),
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take,
  });
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
