"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { boxCode, plural } from "@/lib/format";
import { formToObject, safeAction } from "@/server/action";
import { requireUser, toActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { parseInput, UserError } from "@/server/errors";
import {
  addBoxToEvent,
  arriveEventBoxes,
  createEvent,
  deleteEvent,
  eventFieldsSchema,
  packForEvent,
  removeBoxFromEvent,
  setPackingList,
  shipEventBoxes,
  updateEvent,
  wrapUpEvent,
} from "@/server/events";
import { runOnce } from "@/server/idempotency";

const id = z.coerce.number().int().positive();
const requestId = z.string().max(100).optional();
const lines = z
  .array(z.object({ itemId: id, quantity: z.number().int().min(0, "Quantities can't be negative.").max(1_000_000) }))
  .max(500);

function parseJson(form: FormData, key: string): unknown {
  try {
    return JSON.parse(String(form.get(key) ?? "null"));
  } catch {
    throw new UserError("The form data couldn't be read. Please try again.");
  }
}

const rid = (form: FormData) => parseInput(requestId, form.get("requestId") ?? undefined);
/** Bound arguments come from the browser too, so check them like any input. */
const checkId = (value: unknown) => parseInput(id, value);

export async function createEventAction(form: FormData): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const fields = parseInput(eventFieldsSchema, formToObject(form));
    const { result } = await runOnce(db, user.id, rid(form), async (tx) => {
      const event = await createEvent(tx, toActor(user), fields);
      return { id: event.id };
    });
    return { ok: true, data: result, message: `${fields.name} created.` };
  });
}

export async function updateEventAction(eventId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const fields = parseInput(eventFieldsSchema, formToObject(form));
    await db.$transaction((tx) => updateEvent(tx, toActor(user), checkId(eventId), fields));
    return { ok: true, message: "Event saved." };
  });
}

export async function deleteEventAction(eventId: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    await db.$transaction((tx) => deleteEvent(tx, toActor(user), checkId(eventId)));
    return { ok: true, message: "Event deleted." };
  });
}

export async function savePackingListAction(eventId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const list = parseInput(lines, parseJson(form, "lines"));
    const { changed } = await db.$transaction((tx) => setPackingList(tx, toActor(user), checkId(eventId), list));
    return { ok: true, message: changed ? "Packing list saved." : "Nothing changed." };
  });
}

export async function packForEventAction(eventId: number, form: FormData): Promise<ActionResult<{ code: string }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const input = parseInput(
      z.object({ locationId: id, boxId: id.optional(), lines }),
      { locationId: form.get("locationId"), boxId: form.get("boxId") || undefined, lines: parseJson(form, "lines") },
    );
    const { result } = await runOnce(db, user.id, rid(form), async (tx) => {
      const r = await packForEvent(tx, toActor(user), { eventId: checkId(eventId), ...input });
      return { code: r.code };
    });
    const pieces = input.lines.reduce((s, l) => s + l.quantity, 0);
    return { ok: true, data: result, message: `Packed ${plural(pieces, "piece")} into ${result.code}.` };
  });
}

export async function addBoxToEventAction(eventId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const boxId = parseInput(id, form.get("boxId") || undefined);
    const r = await db.$transaction((tx) => addBoxToEvent(tx, toActor(user), checkId(eventId), boxId));
    refresh();
    return { ok: true, message: r.alreadyLinked ? `${boxCode(boxId)} is already part of this event.` : `${boxCode(boxId)} added.` };
  });
}

export async function removeBoxFromEventAction(eventId: number, boxId: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    await db.$transaction((tx) => removeBoxFromEvent(tx, toActor(user), checkId(eventId), checkId(boxId)));
    refresh();
    return { ok: true, message: `${boxCode(boxId)} removed from the event.` };
  });
}

export async function shipEventAction(eventId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const { result } = await runOnce(db, user.id, rid(form), (tx) => shipEventBoxes(tx, toActor(user), checkId(eventId)), {
      timeout: 30_000,
    });
    refresh();
    return { ok: true, message: `${plural(result.shipped.length, "box", "boxes")} now in transit: ${result.shipped.join(", ")}.` };
  });
}

export async function arriveEventAction(eventId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const { result } = await runOnce(db, user.id, rid(form), (tx) => arriveEventBoxes(tx, toActor(user), checkId(eventId)), {
      timeout: 30_000,
    });
    refresh();
    return { ok: true, message: `${plural(result.arrived.length, "box", "boxes")} marked as arrived.` };
  });
}

const count = z.object({ itemId: id, actual: z.number().int().min(0, "Counts can't be negative.").max(1_000_000) });
const wrapUpSchema = z.object({
  reason: z.string().min(1, "Choose a reason."),
  note: z.string().trim().max(500).optional(),
  boxes: z
    .array(
      z.object({
        boxId: id,
        counts: z.array(count).max(500),
        then: z.discriminatedUnion("action", [
          z.object({ action: z.literal("ship"), destinationId: id }),
          z.object({ action: z.literal("leave") }),
          z.object({ action: z.literal("discard") }),
        ]),
      }),
    )
    .max(200),
  loose: z.array(count.extend({ packInto: id.nullish() })).max(500),
});

export async function wrapUpAction(eventId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const input = parseInput(wrapUpSchema, parseJson(form, "plan"));
    const { result } = await runOnce(db, user.id, rid(form), (tx) => wrapUpEvent(tx, toActor(user), checkId(eventId), input), {
      timeout: 60_000,
    });
    const parts = [
      result.shipped && `${plural(result.shipped, "box", "boxes")} shipped`,
      result.discarded && `${result.discarded} discarded`,
      result.left && `${result.left} left at the venue`,
    ].filter(Boolean);
    return { ok: true, message: `Event wrapped up${parts.length ? `: ${parts.join(", ")}` : ""}.` };
  });
}
