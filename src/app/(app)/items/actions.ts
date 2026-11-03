"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { safeAction } from "@/server/action";
import { requireUser, toActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { parseInput, UserError } from "@/server/errors";
import { runOnce } from "@/server/idempotency";
import {
  addItemPhoto,
  createItem,
  itemFieldsSchema,
  removeItemPhoto,
  setItemArchived,
  setMainPhoto,
  updateItem,
} from "@/server/items";
import { deletePhotoFiles, readUpload, storePhoto } from "@/server/photos";
import { addStock } from "@/server/stock";

const id = z.coerce.number().int().positive();
const quantity = z.coerce
  .number({ message: "Enter a quantity." })
  .int("Use a whole number.")
  .min(1, "Quantity must be at least 1.")
  .max(1_000_000, "That quantity looks too large.");
const requestId = z.string().max(100).optional();

function itemFieldsFrom(form: FormData) {
  return {
    name: form.get("name") ?? "",
    description: form.get("description"),
    companyIds: form.getAll("companyIds"),
    lowStockThreshold: form.get("lowStockThreshold"),
  };
}

/** Store an uploaded photo (outside the transaction) and clean it up if the transaction fails. */
async function withOptionalPhoto<T>(
  entry: FormDataEntryValue | null,
  run: (photo: Awaited<ReturnType<typeof storePhoto>> | null) => Promise<{ result: T; replayed: boolean }>,
): Promise<T> {
  const buffer = await readUpload(entry);
  const photo = buffer ? await storePhoto(buffer) : null;
  try {
    const { result, replayed } = await run(photo);
    if (replayed && photo) await deletePhotoFiles(photo.key); // first attempt already saved its own copy
    return result;
  } catch (err) {
    if (photo) await deletePhotoFiles(photo.key);
    throw err;
  }
}

/**
 * Quick-add: create a new item (or pick an existing one) and add stock at a
 * location, with an optional photo — all in one step.
 */
export async function quickAddAction(form: FormData): Promise<ActionResult<{ itemId: number }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const actor = toActor(user);
    const common = parseInput(
      z.object({ requestId, quantity, locationId: id.optional(), existingItemId: id.optional() }),
      {
        requestId: form.get("requestId") ?? undefined,
        quantity: form.get("quantity"),
        locationId: form.get("locationId") || undefined,
        existingItemId: form.get("existingItemId") || undefined,
      },
    );
    if (!common.locationId) throw new UserError("Choose a location.", { locationId: "Choose a location." });
    const locationId = common.locationId;
    const fields = common.existingItemId ? null : parseInput(itemFieldsSchema, itemFieldsFrom(form));
    const attachPhoto = !common.existingItemId || form.get("addPhoto") === "1";

    const result = await withOptionalPhoto(attachPhoto ? form.get("photo") : null, (photo) =>
      runOnce(db, user.id, common.requestId, async (tx) => {
        const item = common.existingItemId
          ? await tx.item.findUnique({ where: { id: common.existingItemId } })
          : await createItem(tx, actor, fields!);
        if (!item) throw new UserError("That item no longer exists.");
        if (photo) await addItemPhoto(tx, actor, item.id, photo);
        const holding = await addStock(tx, actor, {
          itemId: item.id,
          quantity: common.quantity,
          place: { locationId },
        });
        const location = await tx.location.findUniqueOrThrow({ where: { id: locationId } });
        return {
          itemId: item.id,
          message: `Saved: ${common.quantity} × ${item.name} at ${location.name} (now ${holding.quantity} there).`,
        };
      }),
    );
    return { ok: true, data: { itemId: result.itemId }, message: result.message };
  });
}

export async function updateItemAction(itemId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const fields = parseInput(itemFieldsSchema, itemFieldsFrom(form));
    await db.$transaction((tx) => updateItem(tx, toActor(user), itemId, fields));
    return { ok: true, message: "Item saved." };
  });
}

export async function setItemArchivedAction(itemId: number, archived: boolean): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    await db.$transaction((tx) => setItemArchived(tx, toActor(user), itemId, archived));
    refresh();
    return { ok: true, message: archived ? "Item archived." : "Item restored." };
  });
}

/** Add stock of an existing item at a location (from the item page). */
export async function addStockAction(itemId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const input = parseInput(z.object({ requestId, quantity, locationId: id }), {
      requestId: form.get("requestId") ?? undefined,
      quantity: form.get("quantity"),
      locationId: form.get("locationId"),
    });
    const { result } = await runOnce(db, user.id, input.requestId, async (tx) => {
      const h = await addStock(tx, toActor(user), {
        itemId,
        quantity: input.quantity,
        place: { locationId: input.locationId },
      });
      return { total: h.quantity };
    });
    refresh();
    return { ok: true, message: `Stock added (now ${result.total} there).` };
  });
}

export async function addItemPhotoAction(itemId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const rid = parseInput(requestId, form.get("requestId") ?? undefined);
    const entry = form.get("photo");
    if (!entry || typeof entry === "string" || entry.size === 0) throw new UserError("Choose or take a photo first.");
    await withOptionalPhoto(entry, (photo) =>
      runOnce(db, user.id, rid, async (tx) => {
        await addItemPhoto(tx, toActor(user), itemId, photo!);
        return true;
      }),
    );
    refresh();
    return { ok: true, message: "Photo added." };
  });
}

export async function removeItemPhotoAction(itemId: number, photoId: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const key = await db.$transaction((tx) => removeItemPhoto(tx, toActor(user), itemId, photoId));
    await deletePhotoFiles(key);
    refresh();
    return { ok: true, message: "Photo removed." };
  });
}

export async function setMainPhotoAction(itemId: number, photoId: number): Promise<ActionResult> {
  return safeAction(async () => {
    await requireUser();
    await db.$transaction((tx) => setMainPhoto(tx, itemId, photoId));
    refresh();
    return { ok: true, message: "Main photo changed." };
  });
}
