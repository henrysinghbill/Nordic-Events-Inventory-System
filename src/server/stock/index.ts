/**
 * ============================================================================
 *  STOCK LOGIC — every change to quantities goes through this module.
 * ============================================================================
 * Every function:
 *   - takes a transaction (`tx`) so the change and its history entry are saved
 *     together or not at all;
 *   - checks the business rules and throws UserError with a clear message;
 *   - never lets a quantity go negative (also enforced by the database).
 */
import { reasonLabel } from "@/lib/adjust";
import { boxCode } from "@/lib/format";
import type { Tx } from "../db";
import { UserError } from "../errors";
import { logHistory, type Actor } from "../history";

/** Where a holding is: loose at a location, or inside a box. */
export type Place = { locationId: number; boxId?: undefined } | { boxId: number; locationId?: undefined };

type PlaceInfo = { label: string; locationId: number | null; boxId: number | null };

/** Check a place can receive stock right now and describe it for the history log. */
async function resolvePlace(tx: Tx, place: Place): Promise<PlaceInfo> {
  if (place.boxId !== undefined) {
    const box = await tx.box.findUnique({
      where: { id: place.boxId },
      include: { location: { select: { name: true } } },
    });
    if (!box || box.deletedAt) throw new UserError("That box doesn't exist (it may have been deleted).");
    if (box.status === "IN_TRANSIT" || !box.locationId) {
      throw new UserError(`${boxCode(box.id)} is in transit. Mark it as arrived first.`);
    }
    return {
      label: `${boxCode(box.id)} at ${box.location?.name}`,
      locationId: box.locationId,
      boxId: box.id,
    };
  }
  const location = await tx.location.findUnique({ where: { id: place.locationId } });
  if (!location) throw new UserError("That location doesn't exist.");
  if (location.archivedAt) throw new UserError(`${location.name} is archived.`);
  return { label: location.name, locationId: location.id, boxId: null };
}

function holdingWhere(itemId: number, place: Place) {
  return place.boxId !== undefined
    ? { itemId_boxId: { itemId, boxId: place.boxId } }
    : { itemId_locationId: { itemId, locationId: place.locationId } };
}

function assertPositiveWhole(quantity: number, what = "Quantity") {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new UserError(`${what} must be a whole number above 0.`);
  }
}

/**
 * Add new stock of an item (quick-add, "add stock", bulk entry).
 * Merges into the existing holding at the same place.
 */
export async function addStock(
  tx: Tx,
  actor: Actor,
  input: { itemId: number; quantity: number; place: Place; note?: string | null },
) {
  assertPositiveWhole(input.quantity);
  const item = await tx.item.findUnique({ where: { id: input.itemId } });
  if (!item) throw new UserError("That item doesn't exist.");
  if (item.archivedAt) throw new UserError(`${item.name} is archived. Restore it before adding stock.`);
  const place = await resolvePlace(tx, input.place);

  const holding = await tx.holding.upsert({
    where: holdingWhere(item.id, input.place),
    create: {
      itemId: item.id,
      quantity: input.quantity,
      locationId: place.boxId ? null : place.locationId,
      boxId: place.boxId,
    },
    update: { quantity: { increment: input.quantity } },
  });

  await logHistory(tx, actor, {
    action: "STOCK_ADDED",
    summary: `${input.quantity} × ${item.name} added to ${place.label}`,
    itemId: item.id,
    boxId: place.boxId,
    locationId: place.locationId,
    quantity: input.quantity,
    quantityBefore: holding.quantity - input.quantity,
    quantityAfter: holding.quantity,
    note: input.note ?? null,
  });
  return holding;
}

/**
 * Take `quantity` out of a holding. Deletes the holding when it reaches 0.
 * Safe against concurrent changes: the decrement only succeeds if enough is
 * there at the moment of the update.
 */
export async function removeFromHolding(tx: Tx, holdingId: number, quantity: number) {
  assertPositiveWhole(quantity);
  // Taking everything: delete the row (a holding can't sit at 0).
  const deleted = await tx.holding.deleteMany({ where: { id: holdingId, quantity } });
  if (deleted.count === 1) return;
  // Taking part: only succeeds if more than `quantity` is there right now.
  const updated = await tx.holding.updateMany({
    where: { id: holdingId, quantity: { gt: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (updated.count === 1) return;

  const current = await tx.holding.findUnique({ where: { id: holdingId }, include: { item: true } });
  if (!current) throw new UserError("That stock no longer exists. Someone may have just moved it.");
  throw new UserError(`Only ${current.quantity} of ${current.item.name} available, not ${quantity}.`);
}

/** Total quantity of an item everywhere (loose + in boxes, including in transit). */
export async function totalQuantity(tx: Tx, itemId: number): Promise<number> {
  const sum = await tx.holding.aggregate({
    where: { itemId, OR: [{ boxId: null }, { box: { deletedAt: null } }] },
    _sum: { quantity: true },
  });
  return sum._sum.quantity ?? 0;
}

/**
 * Count / adjust: set an item's quantity at a place to what is actually there
 * now (e.g. after an event), with a reason. 0 removes the holding.
 * Returns whether anything changed.
 */
export async function countStock(
  tx: Tx,
  actor: Actor,
  input: { itemId: number; place: Place; actual: number; reason: string; note?: string | null },
): Promise<{ changed: boolean; before: number; after: number }> {
  if (!Number.isInteger(input.actual) || input.actual < 0) {
    throw new UserError("Counts must be whole numbers, 0 or more.");
  }
  const reason = reasonLabel(input.reason);
  if (!reason) throw new UserError("Choose a reason for the change.", { reason: "Choose a reason." });
  const item = await tx.item.findUnique({ where: { id: input.itemId } });
  if (!item) throw new UserError("That item doesn't exist.");
  const place = await resolvePlace(tx, input.place);

  const existing = await tx.holding.findUnique({ where: holdingWhere(item.id, input.place) });
  if (existing) {
    // Lock the row so a simultaneous pack/unpack waits and "before" is exact.
    await tx.$queryRaw`SELECT id FROM "Holding" WHERE id = ${existing.id} FOR UPDATE`;
  }
  const current = existing ? await tx.holding.findUnique({ where: { id: existing.id } }) : null;
  const before = current?.quantity ?? 0;
  const after = input.actual;
  if (before === after) return { changed: false, before, after };

  if (after === 0) {
    await tx.holding.delete({ where: { id: current!.id } });
  } else if (current) {
    await tx.holding.update({ where: { id: current.id }, data: { quantity: after } });
  } else {
    await tx.holding.create({
      data: { itemId: item.id, quantity: after, locationId: place.boxId ? null : place.locationId, boxId: place.boxId },
    });
  }

  await logHistory(tx, actor, {
    action: "QUANTITY_ADJUSTED",
    summary: `${item.name} in ${place.label} counted: ${before} → ${after} (${reason.toLowerCase()})`,
    itemId: item.id,
    boxId: place.boxId,
    locationId: place.locationId,
    quantity: after - before,
    quantityBefore: before,
    quantityAfter: after,
    reason,
    note: input.note?.trim() || null,
  });
  return { changed: true, before, after };
}
