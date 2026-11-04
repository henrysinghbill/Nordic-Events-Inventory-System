/**
 * Events: a packing list, boxes packed for the event, shipping them all to the
 * venue, marking them all arrived, and the post-event wrap-up (count what's
 * left, then send boxes back, leave them, or discard empty ones).
 *
 * Same rules as the stock module: everything runs inside the caller's
 * transaction and throws UserError with a clear message. All box and stock
 * changes go through the existing stock functions; this module only decides
 * which boxes and quantities they apply to.
 */
import { z } from "zod";
import { dayString, formatDayRange, parseDay } from "@/lib/days";
import { boxCode, plural } from "@/lib/format";
import type { Tx } from "./db";
import { UserError } from "./errors";
import { logHistory, type Actor } from "./history";
import { countStock } from "./stock";
import { createBox, deleteBox, lockBox, locationForStock, packBox, shipBox, arriveBox, type Line } from "./stock/boxes";

// ------------------------------------------------------------ event details

const day = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => parseDay(v) !== null, `Choose ${label}.`)
    .transform((v) => parseDay(v)!);

export const eventFieldsSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(200, "Keep the name under 200 characters."),
    venueId: z.coerce.number({ message: "Choose a venue." }).int().positive("Choose a venue."),
    startDate: day("a start date"),
    endDate: day("an end date"),
    notes: z
      .string()
      .trim()
      .max(2000, "Keep the notes under 2000 characters.")
      .optional()
      .transform((v) => v || null),
  })
  .refine((e) => e.endDate >= e.startDate, { path: ["endDate"], message: "The end date can't be before the start date." });

export type EventFields = z.infer<typeof eventFieldsSchema>;

/** Lock the event row so two people can't ship / wrap up the same event at once. */
async function lockEvent(tx: Tx, eventId: number) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
  const event = await tx.event.findUnique({ where: { id: eventId }, include: { venue: true } });
  if (!event) throw new UserError("That event doesn't exist (it may have been deleted).");
  return event;
}

async function openEvent(tx: Tx, eventId: number) {
  const event = await lockEvent(tx, eventId);
  if (event.wrappedUpAt) throw new UserError(`${event.name} has already been wrapped up.`);
  return event;
}

/** History entries written while working on an event are tagged with it. */
const forEvent = (actor: Actor, eventId: number): Actor => ({ ...actor, eventId });

export async function createEvent(tx: Tx, actor: Actor, fields: EventFields) {
  const venue = await locationForStock(tx, fields.venueId);
  const event = await tx.event.create({ data: fields });
  await logHistory(tx, actor, {
    action: "EVENT_CREATED",
    summary: `Event "${event.name}" created at ${venue.name} (${formatDayRange(event.startDate, event.endDate)})`,
    eventId: event.id,
    locationId: venue.id,
  });
  return event;
}

export async function updateEvent(tx: Tx, actor: Actor, eventId: number, fields: EventFields) {
  const event = await lockEvent(tx, eventId);
  const changes: string[] = [];
  if (event.name !== fields.name) changes.push(`renamed to "${fields.name}"`);
  if (event.venueId !== fields.venueId) {
    const venue = await locationForStock(tx, fields.venueId);
    changes.push(`venue changed to ${venue.name}`);
  }
  if (dayString(event.startDate) !== dayString(fields.startDate) || dayString(event.endDate) !== dayString(fields.endDate)) {
    changes.push(`dates changed to ${formatDayRange(fields.startDate, fields.endDate)}`);
  }
  if ((event.notes ?? null) !== fields.notes) changes.push("notes edited");
  if (changes.length === 0) return event;
  const updated = await tx.event.update({ where: { id: eventId }, data: fields });
  await logHistory(tx, actor, {
    action: "EVENT_EDITED",
    summary: `Event "${event.name}" ${changes.join(", ")}`,
    eventId,
  });
  return updated;
}

/** Delete an event. Its boxes are kept (just no longer linked); its history stays. */
export async function deleteEvent(tx: Tx, actor: Actor, eventId: number) {
  const event = await lockEvent(tx, eventId);
  const boxes = await tx.box.count({ where: { eventId, deletedAt: null } });
  await tx.event.delete({ where: { id: eventId } });
  await logHistory(tx, actor, {
    action: "EVENT_DELETED",
    summary: `Event "${event.name}" deleted` + (boxes ? ` (${plural(boxes, "box", "boxes")} kept, no longer linked)` : ""),
    eventId,
  });
}

// ------------------------------------------------------------ packing list

/** Replace the event's packing list with these lines (0 or missing = remove). */
export async function setPackingList(tx: Tx, actor: Actor, eventId: number, lines: Line[]) {
  const event = await lockEvent(tx, eventId);
  const wanted = new Map<number, number>();
  for (const { itemId, quantity } of lines) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) {
      throw new UserError("Quantities must be whole numbers, 0 or more.");
    }
    if (quantity > 0) wanted.set(itemId, quantity);
  }
  const current = await tx.eventItem.findMany({ where: { eventId }, include: { item: true } });
  const currentBy = new Map(current.map((c) => [c.itemId, c]));
  const newIds = [...wanted.keys()].filter((id) => !currentBy.has(id));
  const newItems = new Map((await tx.item.findMany({ where: { id: { in: newIds } } })).map((i) => [i.id, i]));

  const changes: string[] = [];
  for (const [itemId, quantity] of wanted) {
    const before = currentBy.get(itemId);
    if (before) {
      if (before.quantity !== quantity) {
        await tx.eventItem.update({ where: { eventId_itemId: { eventId, itemId } }, data: { quantity } });
        changes.push(`${before.item.name} ${before.quantity} → ${quantity}`);
      }
      continue;
    }
    const item = newItems.get(itemId);
    if (!item) throw new UserError("One of the items doesn't exist any more. Reload the page.");
    if (item.archivedAt) throw new UserError(`${item.name} is archived.`);
    await tx.eventItem.create({ data: { eventId, itemId, quantity } });
    changes.push(`added ${quantity} × ${item.name}`);
  }
  for (const c of current) {
    if (!wanted.has(c.itemId)) {
      await tx.eventItem.delete({ where: { eventId_itemId: { eventId, itemId: c.itemId } } });
      changes.push(`removed ${c.item.name}`);
    }
  }
  if (changes.length) {
    await logHistory(tx, actor, {
      action: "EVENT_EDITED",
      summary: `Packing list for "${event.name}": ${changes.join("; ")}`,
      eventId,
    });
  }
  return { changed: changes.length };
}

export type PackSuggestion = {
  itemId: number;
  needed: number;
  packed: number;
  /** Still to pack for the event (never below 0). */
  remaining: number;
  /** Loose at the location being packed from. */
  available: number;
  /** What "Pack for this event" fills in: as much of the remainder as is available. */
  suggest: number;
};

/** Work out what to pre-fill when packing a box for an event from one location. */
export function packSuggestions(
  list: { itemId: number; needed: number }[],
  packed: Map<number, number>,
  available: Map<number, number>,
): PackSuggestion[] {
  return list.map(({ itemId, needed }) => {
    const done = packed.get(itemId) ?? 0;
    const remaining = Math.max(0, needed - done);
    const here = available.get(itemId) ?? 0;
    return { itemId, needed, packed: done, remaining, available: here, suggest: Math.min(remaining, here) };
  });
}

/** How many of each item are packed in the event's boxes (wherever the boxes are). */
export async function packedForEvent(tx: Tx, eventId: number): Promise<Map<number, number>> {
  const rows = await tx.holding.groupBy({
    by: ["itemId"],
    where: { box: { eventId, deletedAt: null } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
}

// ------------------------------------------------------------ boxes

/** Link a box to an event. A box can only be packed for one open event at a time. */
export async function addBoxToEvent(tx: Tx, actor: Actor, eventId: number, boxId: number) {
  const event = await openEvent(tx, eventId);
  const box = await lockBox(tx, boxId);
  if (box.eventId === eventId) return { alreadyLinked: true };
  if (box.eventId) {
    const other = await tx.event.findUnique({ where: { id: box.eventId } });
    if (other && !other.wrappedUpAt) {
      throw new UserError(`${boxCode(box.id)} is packed for ${other.name}. Remove it from that event first.`);
    }
  }
  await tx.box.update({ where: { id: boxId }, data: { eventId } });
  await logHistory(tx, actor, {
    action: "BOX_EDITED",
    summary: `${boxCode(box.id)} added to event "${event.name}"`,
    boxId,
    eventId,
  });
  return { alreadyLinked: false };
}

export async function removeBoxFromEvent(tx: Tx, actor: Actor, eventId: number, boxId: number) {
  const event = await lockEvent(tx, eventId);
  const box = await lockBox(tx, boxId);
  if (box.eventId !== eventId) return;
  await tx.box.update({ where: { id: boxId }, data: { eventId: null } });
  await logHistory(tx, actor, {
    action: "BOX_EDITED",
    summary: `${boxCode(box.id)} removed from event "${event.name}"`,
    boxId,
    eventId,
  });
}

/**
 * "Pack for this event": pack lines from a location's loose stock into a box
 * (a new one, or an existing box at that location) and link it to the event.
 */
export async function packForEvent(
  tx: Tx,
  actor: Actor,
  input: { eventId: number; locationId: number; boxId?: number | null; lines: Line[] },
) {
  const event = await openEvent(tx, input.eventId);
  const evActor = forEvent(actor, event.id);
  let boxId = input.boxId ?? null;
  if (boxId) {
    const box = await lockBox(tx, boxId);
    if (box.status !== "AT_LOCATION" || box.locationId !== input.locationId) {
      throw new UserError(`${boxCode(box.id)} isn't at that location any more.`);
    }
    await addBoxToEvent(tx, evActor, event.id, box.id);
  } else {
    const box = await createBox(tx, evActor, { locationId: input.locationId });
    boxId = box.id;
    await tx.box.update({ where: { id: boxId }, data: { eventId: event.id } });
  }
  await packBox(tx, evActor, { boxId, lines: input.lines });
  return { boxId, code: boxCode(boxId) };
}

/** Ship every box of the event that isn't at the venue yet (and isn't already on its way). */
export async function shipEventBoxes(tx: Tx, actor: Actor, eventId: number) {
  const event = await openEvent(tx, eventId);
  const boxes = await tx.box.findMany({
    where: { eventId, deletedAt: null, status: "AT_LOCATION", NOT: { locationId: event.venueId } },
    orderBy: { id: "asc" },
  });
  if (boxes.length === 0) throw new UserError("There are no boxes waiting to be shipped to the venue.");
  for (const box of boxes) {
    await shipBox(tx, forEvent(actor, eventId), { boxId: box.id, destinationId: event.venueId });
  }
  return { shipped: boxes.map((b) => boxCode(b.id)) };
}

/** Mark every box that is on its way to the venue as arrived there. */
export async function arriveEventBoxes(tx: Tx, actor: Actor, eventId: number) {
  const event = await openEvent(tx, eventId);
  const boxes = await tx.box.findMany({
    where: { eventId, deletedAt: null, status: "IN_TRANSIT", destinationId: event.venueId },
    orderBy: { id: "asc" },
  });
  if (boxes.length === 0) throw new UserError(`No boxes are on their way to ${event.venue.name}.`);
  for (const box of boxes) {
    await arriveBox(tx, forEvent(actor, eventId), { boxId: box.id, locationId: event.venueId });
  }
  return { arrived: boxes.map((b) => boxCode(b.id)) };
}

// ------------------------------------------------------------ wrap-up

export type BoxPlan = { action: "ship"; destinationId: number } | { action: "leave" } | { action: "discard" };

export type WrapUpInput = {
  reason: string;
  note?: string | null;
  /** Every event box that is at the venue, with what's left in it and where it goes. */
  boxes: { boxId: number; counts: { itemId: number; actual: number }[]; then: BoxPlan }[];
  /** Loose stock at the venue: what's left, and optionally a box to pack it all into. */
  loose: { itemId: number; actual: number; packInto?: number | null }[];
};

/**
 * After the event: record what's left, pack loose leftovers back into boxes,
 * then ship each box (back to storage), leave it at the venue, or discard it
 * if it's empty. All of it is saved together, or nothing is.
 */
export async function wrapUpEvent(tx: Tx, actor: Actor, eventId: number, input: WrapUpInput) {
  const event = await openEvent(tx, eventId);
  const evActor = forEvent(actor, eventId);
  const note = input.note?.trim() || null;

  const atVenue = await tx.box.findMany({
    where: { eventId, deletedAt: null, status: "AT_LOCATION", locationId: event.venueId },
    select: { id: true },
  });
  const venueBoxIds = new Set(atVenue.map((b) => b.id));
  const planned = new Set(input.boxes.map((b) => b.boxId));
  if (planned.size !== input.boxes.length || [...planned].some((id) => !venueBoxIds.has(id)) || planned.size !== venueBoxIds.size) {
    throw new UserError("The event's boxes have changed since this page was opened. Reload the page and check again.");
  }

  // 1. Counts.
  let adjusted = 0;
  for (const box of input.boxes) {
    for (const c of box.counts) {
      const r = await countStock(tx, evActor, { itemId: c.itemId, place: { boxId: box.boxId }, actual: c.actual, reason: input.reason, note });
      if (r.changed) adjusted++;
    }
  }
  for (const c of input.loose) {
    const r = await countStock(tx, evActor, { itemId: c.itemId, place: { locationId: event.venueId }, actual: c.actual, reason: input.reason, note });
    if (r.changed) adjusted++;
  }

  // 2. Pack loose leftovers into the chosen boxes.
  const packs = new Map<number, Line[]>();
  for (const c of input.loose) {
    if (!c.packInto || c.actual <= 0) continue;
    if (!venueBoxIds.has(c.packInto)) throw new UserError(`${boxCode(c.packInto)} isn't one of this event's boxes at the venue.`);
    packs.set(c.packInto, [...(packs.get(c.packInto) ?? []), { itemId: c.itemId, quantity: c.actual }]);
  }
  for (const [boxId, lines] of packs) await packBox(tx, evActor, { boxId, lines });

  // 3. Where each box goes.
  let shipped = 0;
  let discarded = 0;
  let left = 0;
  for (const box of input.boxes) {
    if (box.then.action === "discard") {
      const contents = await tx.holding.count({ where: { boxId: box.boxId } });
      if (contents > 0) throw new UserError(`${boxCode(box.boxId)} isn't empty, so it can't be discarded. Ship it or leave it at the venue.`);
      await deleteBox(tx, evActor, box.boxId);
      discarded++;
    } else if (box.then.action === "ship") {
      await shipBox(tx, evActor, { boxId: box.boxId, destinationId: box.then.destinationId });
      shipped++;
    } else {
      left++;
    }
  }

  await tx.event.update({ where: { id: eventId }, data: { wrappedUpAt: new Date() } });
  const parts = [
    adjusted && `${plural(adjusted, "count")} updated`,
    shipped && `${plural(shipped, "box", "boxes")} shipped`,
    discarded && `${plural(discarded, "empty box", "empty boxes")} discarded`,
    left && `${plural(left, "box", "boxes")} left at ${event.venue.name}`,
  ].filter(Boolean);
  await logHistory(tx, evActor, {
    action: "EVENT_WRAPPED_UP",
    summary: `Event "${event.name}" wrapped up` + (parts.length ? `: ${parts.join(", ")}` : ""),
    locationId: event.venueId,
    note,
  });
  return { adjusted, shipped, discarded, left };
}
