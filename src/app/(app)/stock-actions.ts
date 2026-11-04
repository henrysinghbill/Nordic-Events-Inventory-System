"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { safeAction } from "@/server/action";
import { requireUser, toActor } from "@/server/auth/session";
import { bulkAdd, MAX_BULK_ROWS } from "@/server/bulk";
import { db } from "@/server/db";
import { parseInput, UserError } from "@/server/errors";
import { runOnce } from "@/server/idempotency";
import { countStock, type Place } from "@/server/stock";

const id = z.coerce.number().int().positive();

function parseJson(form: FormData, key: string): unknown {
  try {
    return JSON.parse(String(form.get(key) ?? "[]"));
  } catch {
    throw new UserError("The form data couldn't be read. Please try again.");
  }
}

/** Count / adjust several items at one place (a box, or a location's loose stock). */
export async function countAction(rawPlace: Place, form: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    // Bound arguments come from the browser too, so check them like any input.
    const parsed = parseInput(z.object({ boxId: id.optional(), locationId: id.optional() }), rawPlace);
    const place: Place = parsed.boxId ? { boxId: parsed.boxId } : { locationId: parsed.locationId ?? 0 };
    const input = parseInput(
      z.object({
        requestId: z.string().max(100).optional(),
        reason: z.string().min(1, "Choose a reason."),
        note: z.string().trim().max(500).optional(),
        lines: z.array(z.object({ itemId: id, actual: z.number().int().min(0, "Counts can't be negative.") })).min(1, "Nothing was changed.").max(500),
      }),
      {
        requestId: form.get("requestId") ?? undefined,
        reason: form.get("reason") ?? "",
        note: form.get("note") ?? undefined,
        lines: parseJson(form, "lines"),
      },
    );
    const { result } = await runOnce(db, user.id, input.requestId, async (tx) => {
      let changed = 0;
      for (const line of input.lines) {
        const r = await countStock(tx, toActor(user), { itemId: line.itemId, place, actual: line.actual, reason: input.reason, note: input.note });
        if (r.changed) changed++;
      }
      return { changed };
    });
    return {
      ok: true,
      message: result.changed ? `Saved ${result.changed} change${result.changed === 1 ? "" : "s"}.` : "Nothing changed.",
    };
  });
}

/** Bulk entry grid: all rows are saved together, or none. */
export async function bulkAddAction(form: FormData): Promise<ActionResult<{ created: number; addedTo: number }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const input = parseInput(
      z.object({
        requestId: z.string().max(100).optional(),
        rows: z
          .array(
            z.object({
              row: z.number().int().positive(),
              name: z.string().max(300),
              companies: z.string().max(500),
              quantity: z.number(),
              locationId: z.number().int(),
              boxId: z.number().int().positive().nullish(),
              existingItemId: z.number().int().positive().nullish(),
            }),
          )
          .max(MAX_BULK_ROWS, `Save at most ${MAX_BULK_ROWS} rows at a time.`),
      }),
      { requestId: form.get("requestId") ?? undefined, rows: parseJson(form, "rows") },
    );
    const { result } = await runOnce(db, user.id, input.requestId, (tx) => bulkAdd(tx, toActor(user), input.rows), {
      timeout: 60_000,
    });
    const parts = [
      result.created && `${result.created} new item${result.created === 1 ? "" : "s"}`,
      result.addedTo && `stock added to ${result.addedTo} existing item${result.addedTo === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return { ok: true, data: result, message: `Saved: ${parts.join(", ")}.` };
  });
}
