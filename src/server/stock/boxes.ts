/**
 * Box operations: create, pack, unpack, ship, arrive, delete, link barcodes.
 * Same rules as the rest of the stock module: one transaction per operation,
 * clear UserErrors, history written alongside every change.
 *
 * Every function starts by locking the box row (SELECT … FOR UPDATE), so two
 * people acting on the same box at the same moment are handled one after the other.
 */
import { interpretScan, ROUTING_MESSAGE } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import type { Tx } from "../db";
import { UserError } from "../errors";
import { logHistory, type Actor } from "../history";
import { removeFromHolding } from "./index";

export type Line = { itemId: number; quantity: number };

async function lockBox(tx: Tx, boxId: number) {
  await tx.$queryRaw`SELECT id FROM "Box" WHERE id = ${boxId} FOR UPDATE`;
  const box = await tx.box.findUnique({
    where: { id: boxId },
    include: { location: true, origin: true, destination: true },
  });
  if (!box || box.deletedAt) throw new UserError("That box doesn't exist (it may have been deleted).");
  return box;
}

async function boxAtLocation(tx: Tx, boxId: number) {
  const box = await lockBox(tx, boxId);
  if (box.status !== "AT_LOCATION" || !box.location) {
    throw new UserError(`${boxCode(box.id)} is in transit. Mark it as arrived first.`);
  }
  return { ...box, location: box.location };
}

/** Combine duplicate items, drop zero lines, check quantities. */
function cleanLines(lines: Line[]): Line[] {
  const totals = new Map<number, number>();
  for (const { itemId, quantity } of lines) {
    if (!Number.isInteger(quantity) || quantity < 0) throw new UserError("Quantities must be whole numbers.");
    if (quantity > 0) totals.set(itemId, (totals.get(itemId) ?? 0) + quantity);
  }
  if (totals.size === 0) throw new UserError("Enter a quantity for at least one item.");
  return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
}

async function locationForStock(tx: Tx, locationId: number) {
  const location = await tx.location.findUnique({ where: { id: locationId } });
  if (!location) throw new UserError("That location doesn't exist.");
  if (location.archivedAt) throw new UserError(`${location.name} is archived.`);
  return location;
}

export async function createBox(
  tx: Tx,
  actor: Actor,
  input: { locationId: number; description?: string | null },
) {
  const location = await locationForStock(tx, input.locationId);
  const box = await tx.box.create({
    data: { locationId: location.id, description: input.description?.trim() || null },
  });
  await logHistory(tx, actor, {
    action: "BOX_CREATED",
    summary: `${boxCode(box.id)} created at ${location.name}`,
    boxId: box.id,
    locationId: location.id,
  });
  return box;
}

/** Move items from the location's loose stock into the box. */
export async function packBox(tx: Tx, actor: Actor, input: { boxId: number; lines: Line[] }) {
  const box = await boxAtLocation(tx, input.boxId);
  for (const line of cleanLines(input.lines)) {
    const loose = await tx.holding.findUnique({
      where: { itemId_locationId: { itemId: line.itemId, locationId: box.location.id } },
      include: { item: true },
    });
    if (!loose) throw new UserError(`That item isn't in the loose stock at ${box.location.name}.`);
    await removeFromHolding(tx, loose.id, line.quantity);
    const packed = await tx.holding.upsert({
      where: { itemId_boxId: { itemId: line.itemId, boxId: box.id } },
      create: { itemId: line.itemId, boxId: box.id, quantity: line.quantity },
      update: { quantity: { increment: line.quantity } },
    });
    await logHistory(tx, actor, {
      action: "PACKED",
      summary: `${line.quantity} × ${loose.item.name} packed into ${boxCode(box.id)} at ${box.location.name}`,
      itemId: line.itemId,
      boxId: box.id,
      locationId: box.location.id,
      quantity: line.quantity,
      quantityBefore: packed.quantity - line.quantity,
      quantityAfter: packed.quantity,
    });
  }
}

/**
 * Move items out of the box into the location's loose stock, merging with
 * what's already there. Returns whether the box is now empty.
 */
export async function unpackBox(tx: Tx, actor: Actor, input: { boxId: number; lines: Line[] }) {
  const box = await boxAtLocation(tx, input.boxId);
  await locationForStock(tx, box.location.id);
  for (const line of cleanLines(input.lines)) {
    const inBox = await tx.holding.findUnique({
      where: { itemId_boxId: { itemId: line.itemId, boxId: box.id } },
      include: { item: true },
    });
    if (!inBox) throw new UserError(`That item isn't in ${boxCode(box.id)} (someone may have just unpacked it).`);
    await removeFromHolding(tx, inBox.id, line.quantity);
    const loose = await tx.holding.upsert({
      where: { itemId_locationId: { itemId: line.itemId, locationId: box.location.id } },
      create: { itemId: line.itemId, locationId: box.location.id, quantity: line.quantity },
      update: { quantity: { increment: line.quantity } },
    });
    await logHistory(tx, actor, {
      action: "UNPACKED",
      summary: `${line.quantity} × ${inBox.item.name} unpacked from ${boxCode(box.id)} at ${box.location.name}`,
      itemId: line.itemId,
      boxId: box.id,
      locationId: box.location.id,
      quantity: line.quantity,
      quantityBefore: loose.quantity - line.quantity,
      quantityAfter: loose.quantity,
    });
  }
  const remaining = await tx.holding.count({ where: { boxId: box.id } });
  return { empty: remaining === 0 };
}

/** Log one entry per item in the box (so item pages show the move), or one for an empty box. */
async function logBoxMove(
  tx: Tx,
  actor: Actor,
  boxId: number,
  base: { action: "SHIPPED" | "ARRIVED"; fromLocationId: number | null; toLocationId: number; locationId?: number },
  describe: (what: string) => string,
) {
  const contents = await tx.holding.findMany({ where: { boxId }, include: { item: true } });
  if (contents.length === 0) {
    await logHistory(tx, actor, { ...base, boxId, summary: describe(`${boxCode(boxId)} (empty)`) });
    return;
  }
  for (const h of contents) {
    await logHistory(tx, actor, {
      ...base,
      boxId,
      itemId: h.itemId,
      quantity: h.quantity,
      summary: describe(`${h.quantity} × ${h.item.name} in ${boxCode(boxId)}`),
    });
  }
}

export async function shipBox(tx: Tx, actor: Actor, input: { boxId: number; destinationId: number }) {
  const box = await boxAtLocation(tx, input.boxId);
  const destination = await locationForStock(tx, input.destinationId);
  if (destination.id === box.location.id) throw new UserError(`${boxCode(box.id)} is already at ${destination.name}.`);
  await tx.box.update({
    where: { id: box.id },
    data: { status: "IN_TRANSIT", locationId: null, originId: box.location.id, destinationId: destination.id },
  });
  await logBoxMove(
    tx,
    actor,
    box.id,
    { action: "SHIPPED", fromLocationId: box.location.id, toLocationId: destination.id },
    (what) => `${what} shipped from ${box.location.name} to ${destination.name}`,
  );
}

export async function arriveBox(tx: Tx, actor: Actor, input: { boxId: number; locationId: number }) {
  const box = await lockBox(tx, input.boxId);
  if (box.status !== "IN_TRANSIT") throw new UserError(`${boxCode(box.id)} isn't in transit; it's at ${box.location?.name}.`);
  const location = await locationForStock(tx, input.locationId);
  await tx.box.update({
    where: { id: box.id },
    data: { status: "AT_LOCATION", locationId: location.id, originId: null, destinationId: null },
  });
  await logBoxMove(
    tx,
    actor,
    box.id,
    { action: "ARRIVED", fromLocationId: box.originId, toLocationId: location.id, locationId: location.id },
    (what) =>
      `${what} arrived at ${location.name}` +
      (box.destinationId && box.destinationId !== location.id ? ` (was heading to ${box.destination?.name})` : ""),
  );
}

/** Soft-delete an empty box. Its number is never reused and its history stays. */
export async function deleteBox(tx: Tx, actor: Actor, boxId: number) {
  const box = await lockBox(tx, boxId);
  const contents = await tx.holding.count({ where: { boxId } });
  if (contents > 0) throw new UserError(`${boxCode(box.id)} still contains items. Unpack it first.`);
  await tx.box.update({ where: { id: boxId }, data: { deletedAt: new Date() } });
  await logHistory(tx, actor, {
    action: "BOX_DELETED",
    summary: `${boxCode(box.id)} discarded${box.location ? ` at ${box.location.name}` : ""}`,
    boxId,
    locationId: box.locationId,
  });
}

export async function updateBoxDescription(tx: Tx, actor: Actor, boxId: number, description: string | null) {
  const box = await lockBox(tx, boxId);
  const value = description?.trim() || null;
  if ((box.description ?? null) === value) return;
  await tx.box.update({ where: { id: boxId }, data: { description: value } });
  await logHistory(tx, actor, {
    action: "BOX_EDITED",
    summary: `${boxCode(box.id)} description ${value ? `set to "${value}"` : "removed"}`,
    boxId,
  });
}

const typeLabel = { DHL_PIECE: "DHL piece ID", DHL_WAYBILL: "DHL waybill", OTHER: "barcode" } as const;

/**
 * Link a scanned/typed barcode to a box. Piece IDs (and other barcodes) can
 * only belong to one box; a waybill can be shared by several boxes.
 */
export async function linkBarcode(tx: Tx, actor: Actor, boxId: number, raw: string) {
  const box = await lockBox(tx, boxId);
  const meaning = interpretScan(raw);
  if (meaning.kind === "empty") throw new UserError("Scan or type a barcode first.");
  if (meaning.kind === "dhl_routing") throw new UserError(ROUTING_MESSAGE);
  if (meaning.kind === "box") throw new UserError(`That's an app label for ${boxCode(meaning.boxId)}, not a DHL barcode.`);

  const type = meaning.kind === "dhl_piece" ? "DHL_PIECE" : meaning.kind === "dhl_waybill" ? "DHL_WAYBILL" : "OTHER";
  const value = meaning.value;

  const existing = await tx.barcode.findMany({ where: { value }, include: { box: true } });
  if (existing.some((b) => b.boxId === boxId)) {
    return { type, value, alreadyLinked: true };
  }
  if (type !== "DHL_WAYBILL") {
    const other = existing.find((b) => b.type !== "DHL_WAYBILL");
    if (other) {
      throw new UserError(
        `That ${typeLabel[type]} is already linked to ${boxCode(other.boxId)}${other.box.deletedAt ? " (a discarded box)" : ""}.`,
      );
    }
  }
  await tx.barcode.create({ data: { boxId, type, value } });
  await logHistory(tx, actor, {
    action: "BARCODE_LINKED",
    summary: `${typeLabel[type]} ${value} linked to ${boxCode(box.id)}`,
    boxId,
  });
  return { type, value, alreadyLinked: false };
}

export type Resolved =
  | { result: "box"; code: string }
  | { result: "choose"; boxes: { code: string; where: string }[] }
  | { result: "message"; message: string }
  | { result: "unknown"; value: string; kind: "dhl_piece" | "dhl_waybill" | "other" };

/** What should happen when this value is scanned or typed? */
export async function resolveScan(tx: Tx, raw: string): Promise<Resolved> {
  const meaning = interpretScan(raw);
  switch (meaning.kind) {
    case "empty":
      return { result: "message", message: "Nothing was entered." };
    case "dhl_routing":
      return { result: "message", message: ROUTING_MESSAGE };
    case "box": {
      const box = await tx.box.findUnique({ where: { id: meaning.boxId } });
      if (!box) return { result: "message", message: `There is no ${boxCode(meaning.boxId)}.` };
      if (box.deletedAt) return { result: "message", message: `${boxCode(box.id)} was discarded. Its history is still kept.` };
      return { result: "box", code: boxCode(box.id) };
    }
    default: {
      const matches = await tx.barcode.findMany({
        where: { value: meaning.value },
        include: { box: { include: { location: true, destination: true } } },
        orderBy: { box: { id: "asc" } },
      });
      const live = matches.filter((m) => !m.box.deletedAt);
      if (live.length === 1) return { result: "box", code: boxCode(live[0].boxId) };
      if (live.length > 1) {
        return {
          result: "choose",
          boxes: live.map((m) => ({
            code: boxCode(m.boxId),
            where: m.box.location ? `at ${m.box.location.name}` : `in transit to ${m.box.destination?.name}`,
          })),
        };
      }
      if (matches.length > 0) {
        return { result: "message", message: `That barcode belonged to ${boxCode(matches[0].boxId)}, which was discarded.` };
      }
      return { result: "unknown", value: meaning.value, kind: meaning.kind };
    }
  }
}
