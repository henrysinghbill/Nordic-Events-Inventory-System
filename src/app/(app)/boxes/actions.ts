"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { interpretScan } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import { safeAction } from "@/server/action";
import { requireUser, toActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { parseInput, UserError } from "@/server/errors";
import { logHistory } from "@/server/history";
import { runOnce } from "@/server/idempotency";
import { deletePhotoFiles, readUpload, storePhoto } from "@/server/photos";
import {
  arriveBox,
  createBox,
  deleteBox,
  linkBarcode,
  packBox,
  resolveScan,
  shipBox,
  unpackBox,
  updateBoxDescription,
  type Resolved,
} from "@/server/stock/boxes";

const id = z.coerce.number().int().positive();
const requestId = z.string().max(100).optional();
const lines = z
  .array(z.object({ itemId: id, quantity: z.number().int().min(0, "Quantities can't be negative.") }))
  .max(500);

function parseLines(form: FormData) {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("lines") ?? "[]"));
  } catch {
    throw new UserError("The list of items couldn't be read. Please try again.");
  }
  return parseInput(lines, raw);
}

const rid = (form: FormData) => parseInput(requestId, form.get("requestId") ?? undefined);

export async function createBoxAction(form: FormData): Promise<ActionResult<{ code: string }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const input = parseInput(
      z.object({ locationId: id, description: z.string().trim().max(300).optional() }),
      { locationId: form.get("locationId"), description: form.get("description") ?? undefined },
    );
    const { result } = await runOnce(db, user.id, rid(form), async (tx) => {
      const box = await createBox(tx, toActor(user), input);
      return { code: boxCode(box.id) };
    });
    return { ok: true, data: result, message: `${result.code} created.` };
  });
}

/** Create a box and link the barcode that was just scanned to it. */
export async function createBoxWithBarcodeAction(form: FormData): Promise<ActionResult<{ code: string }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const input = parseInput(z.object({ locationId: id, barcode: z.string().min(1).max(200) }), {
      locationId: form.get("locationId"),
      barcode: form.get("barcode"),
    });
    const { result } = await runOnce(db, user.id, rid(form), async (tx) => {
      const box = await createBox(tx, toActor(user), { locationId: input.locationId });
      await linkBarcode(tx, toActor(user), box.id, input.barcode);
      return { code: boxCode(box.id) };
    });
    return { ok: true, data: result, message: `${result.code} created with that barcode.` };
  });
}

export async function packAction(boxId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const packLines = parseLines(form);
    await runOnce(db, user.id, rid(form), async (tx) => {
      await packBox(tx, toActor(user), { boxId, lines: packLines });
      return true;
    });
    const pieces = packLines.reduce((s, l) => s + l.quantity, 0);
    return { ok: true, message: `Packed ${pieces} piece${pieces === 1 ? "" : "s"} into ${boxCode(boxId)}.` };
  });
}

export async function unpackAction(boxId: number, form: FormData): Promise<ActionResult<{ empty: boolean }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const unpackLines = parseLines(form);
    const { result } = await runOnce(db, user.id, rid(form), (tx) =>
      unpackBox(tx, toActor(user), { boxId, lines: unpackLines }),
    );
    return { ok: true, data: result, message: `Unpacked from ${boxCode(boxId)}.` };
  });
}

export async function deleteBoxAction(boxId: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    await db.$transaction((tx) => deleteBox(tx, toActor(user), boxId));
    return { ok: true, message: `${boxCode(boxId)} discarded.` };
  });
}

/** Ship, optionally linking scanned DHL barcodes in the same step. */
export async function shipAction(boxId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const destinationId = parseInput(id, form.get("destinationId"));
    const barcodes = form.getAll("barcode").map(String).filter((b) => b.trim());
    await runOnce(db, user.id, rid(form), async (tx) => {
      for (const b of barcodes) await linkBarcode(tx, toActor(user), boxId, b);
      await shipBox(tx, toActor(user), { boxId, destinationId });
      return true;
    });
    return { ok: true, message: `${boxCode(boxId)} is now in transit.` };
  });
}

export async function arriveAction(boxId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const locationId = parseInput(id, form.get("locationId"));
    await runOnce(db, user.id, rid(form), async (tx) => {
      await arriveBox(tx, toActor(user), { boxId, locationId });
      return true;
    });
    refresh();
    return { ok: true, message: `${boxCode(boxId)} marked as arrived.` };
  });
}

/**
 * Link one or more scanned barcodes (a camera frame can hold the piece ID and
 * the waybill). Routing barcodes and app labels in the same frame are ignored;
 * if nothing else was scanned, the reason is reported.
 */
export async function linkBarcodeAction(boxId: number, raws: string | string[]): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const all = (Array.isArray(raws) ? raws : [raws]).map(String).slice(0, 10);
    const useful = all.filter((r) => ["dhl_piece", "dhl_waybill", "other"].includes(interpretScan(r).kind));
    const results = await db.$transaction(async (tx) => {
      const out = [];
      for (const raw of useful.length ? useful : all.slice(0, 1)) out.push(await linkBarcode(tx, toActor(user), boxId, raw));
      return out;
    });
    refresh();
    const linked = results.filter((r) => !r.alreadyLinked).map((r) => r.value);
    return {
      ok: true,
      message: linked.length ? `Linked ${linked.join(" and ")}.` : "Already linked to this box.",
    };
  });
}

export async function updateBoxAction(boxId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const description = parseInput(z.string().trim().max(300, "Keep it under 300 characters."), form.get("description") ?? "");
    await db.$transaction((tx) => updateBoxDescription(tx, toActor(user), boxId, description));
    refresh();
    return { ok: true, message: "Box saved." };
  });
}

/** Set (or replace) the photo of a box. */
export async function boxPhotoAction(boxId: number, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const buffer = await readUpload(form.get("photo"));
    if (!buffer) throw new UserError("Take or choose a photo first.");
    const photo = await storePhoto(buffer);
    let oldKeys: string[] = [];
    try {
      oldKeys = await db.$transaction(async (tx) => {
        const box = await tx.box.findUnique({ where: { id: boxId }, include: { photos: true } });
        if (!box || box.deletedAt) throw new UserError("That box doesn't exist.");
        await tx.photo.deleteMany({ where: { boxId } });
        await tx.photo.create({ data: { ...photo, boxId } });
        await logHistory(tx, toActor(user), {
          action: "PHOTO_ADDED",
          summary: `Photo ${box.photos.length ? "replaced" : "added"} for ${boxCode(boxId)}`,
          boxId,
        });
        return box.photos.map((p) => p.key);
      });
    } catch (err) {
      await deletePhotoFiles(photo.key);
      throw err;
    }
    await Promise.all(oldKeys.map(deletePhotoFiles));
    refresh();
    return { ok: true, message: "Box photo saved." };
  });
}

export async function resolveScanAction(raw: string): Promise<ActionResult<Resolved>> {
  return safeAction(async () => {
    await requireUser();
    const data = await db.$transaction((tx) => resolveScan(tx, String(raw).slice(0, 300)));
    return { ok: true, data };
  });
}
