/**
 * "Download inventory (Excel)": everything in one workbook, as of now.
 *   Where things are — one row per item per place (loose or in a box)
 *   Items            — one row per item, with totals
 *   Boxes            — one row per box, with a contents summary
 *   Events           — one row per event
 */
import { eventPhase, formatDay, PHASE_LABEL, todayIn } from "@/lib/days";
import { boxCode } from "@/lib/format";
import type { Db } from "./db";
import { buildXlsx, type Sheet } from "./xlsx";

const yesNo = (b: boolean) => (b ? "Yes" : "No");

export async function inventoryWorkbook(db: Db, timeZone: string): Promise<Buffer> {
  const [items, holdings, boxes, events] = await Promise.all([
    db.item.findMany({
      include: {
        companies: { include: { company: true } },
        _count: { select: { photos: true } },
        holdings: { where: { OR: [{ boxId: null }, { box: { deletedAt: null } }] }, select: { quantity: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.holding.findMany({
      where: { OR: [{ boxId: null }, { box: { deletedAt: null } }] },
      include: {
        item: { include: { companies: { include: { company: true } } } },
        location: true,
        box: { include: { location: true, origin: true, destination: true, event: true } },
      },
    }),
    db.box.findMany({
      where: { deletedAt: null },
      include: {
        location: true,
        origin: true,
        destination: true,
        event: true,
        holdings: { include: { item: true }, orderBy: { item: { name: "asc" } } },
        barcodes: { where: { type: "DHL_WAYBILL" }, orderBy: { id: "desc" }, take: 1 },
      },
      orderBy: { id: "asc" },
    }),
    db.event.findMany({
      include: { venue: true, _count: { select: { boxes: { where: { deletedAt: null } } } } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const today = todayIn(timeZone);
  const companies = (i: { companies: { company: { name: string } }[] }) =>
    i.companies
      .map((c) => c.company.name)
      .sort()
      .join(", ");
  const route = (b: { location: { name: string } | null; origin: { name: string } | null; destination: { name: string } | null }) =>
    b.location ? b.location.name : `In transit: ${b.origin?.name ?? "?"} → ${b.destination?.name ?? "?"}`;

  const where: Sheet = {
    name: "Where things are",
    header: ["Item", "Companies", "Quantity", "Location", "Box", "Box status", "Event"],
    widths: [36, 30, 10, 34, 11, 13, 28],
    rows: holdings
      .map((h) => [
        h.item.name,
        companies(h.item),
        h.quantity,
        h.location ? h.location.name : h.box ? route(h.box) : "",
        h.box ? boxCode(h.box.id) : "(loose)",
        h.box ? (h.box.status === "IN_TRANSIT" ? "In transit" : "At location") : "",
        h.box?.event?.name ?? "",
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[3]).localeCompare(String(b[3]))),
  };

  const itemSheet: Sheet = {
    name: "Items",
    header: ["Item", "Companies", "Total quantity", "Low-stock level", "Low stock", "Description", "Has photo", "Archived", "Item ID"],
    widths: [36, 30, 14, 15, 10, 40, 10, 10, 9],
    rows: items.map((i) => {
      const total = i.holdings.reduce((s, h) => s + h.quantity, 0);
      return [
        i.name,
        companies(i),
        total,
        i.lowStockThreshold,
        i.lowStockThreshold !== null && !i.archivedAt ? yesNo(total < i.lowStockThreshold) : "",
        i.description,
        yesNo(i._count.photos > 0),
        yesNo(Boolean(i.archivedAt)),
        i.id,
      ];
    }),
  };

  const boxSheet: Sheet = {
    name: "Boxes",
    header: ["Box", "Status", "Location / route", "Description", "Event", "Items", "Pieces", "DHL waybill", "Contents"],
    widths: [11, 12, 40, 28, 28, 7, 8, 13, 60],
    rows: boxes.map((b) => [
      boxCode(b.id),
      b.status === "IN_TRANSIT" ? "In transit" : "At location",
      route(b),
      b.description,
      b.event?.name ?? "",
      b.holdings.length,
      b.holdings.reduce((s, h) => s + h.quantity, 0),
      b.barcodes[0]?.value ?? "",
      b.holdings.map((h) => `${h.quantity} × ${h.item.name}`).join(", "),
    ]),
  };

  const eventSheet: Sheet = {
    name: "Events",
    header: ["Event", "Venue", "Start", "End", "Status", "Boxes", "Notes"],
    widths: [32, 30, 12, 12, 22, 7, 40],
    rows: events.map((e) => [
      e.name,
      e.venue.name,
      formatDay(e.startDate),
      formatDay(e.endDate),
      PHASE_LABEL[eventPhase(e, today)],
      e._count.boxes,
      e.notes,
    ]),
  };

  return buildXlsx([where, itemSheet, boxSheet, eventSheet]);
}
