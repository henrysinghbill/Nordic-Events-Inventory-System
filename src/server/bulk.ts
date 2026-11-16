/**
 * Bulk entry: many rows (new items or more stock of existing items) saved in
 * one transaction — either every row is saved or none is.
 */
import { boxCode } from "@/lib/format";
import { matchCompanies } from "@/lib/company-match";
import type { Tx } from "./db";
import { UserError } from "./errors";
import type { Actor } from "./history";
import { createItem } from "./items";
import { addStock } from "./stock";
import { findOrCreateType, typeNameSchema } from "./types";

export type BulkRow = {
  /** Row number as shown in the grid (1-based), used in error messages. */
  row: number;
  name: string;
  /** Optional type name ("Banner"). A name that doesn't exist yet is added as a new type. Ignored for existing items. */
  type?: string | null;
  companies: string;
  quantity: number;
  locationId: number;
  boxId?: number | null;
  /** Add the quantity to this existing item instead of creating a new one. */
  existingItemId?: number | null;
};

export const MAX_BULK_ROWS = 300;

export async function bulkAdd(tx: Tx, actor: Actor, rows: BulkRow[]) {
  if (rows.length === 0) throw new UserError("Fill in at least one row.");
  if (rows.length > MAX_BULK_ROWS) throw new UserError(`Save at most ${MAX_BULK_ROWS} rows at a time.`);

  const companies = await tx.company.findMany({ where: { archivedAt: null } });
  const locations = new Map((await tx.location.findMany({ where: { archivedAt: null } })).map((l) => [l.id, l]));
  const boxIds = rows.map((r) => r.boxId).filter((b): b is number => Boolean(b));
  const boxes = new Map((await tx.box.findMany({ where: { id: { in: boxIds } } })).map((b) => [b.id, b]));
  const existingIds = rows.map((r) => r.existingItemId).filter((i): i is number => Boolean(i));
  const items = new Map((await tx.item.findMany({ where: { id: { in: existingIds } } })).map((i) => [i.id, i]));

  // Check every row first, so all problems are reported at once.
  const errors: Record<string, string> = {};
  const plans: { row: BulkRow; companyIds: number[]; typeName?: string; sameAsRow?: number }[] = [];
  const firstNewRowByName = new Map<string, number>();
  for (const row of rows) {
    // A repeated new name in the same batch adds to the item created by its first row.
    const key = row.name.trim().toLowerCase();
    if (!row.existingItemId && key && firstNewRowByName.has(key)) {
      if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 1_000_000) {
        errors[`row-${row.row}`] ??= "Quantity must be a whole number, 1 or more.";
      }
      if (!locations.has(row.locationId)) errors[`row-${row.row}`] ??= "Choose a location.";
      plans.push({ row, companyIds: [], sameAsRow: firstNewRowByName.get(key) });
      continue;
    }
    if (!row.existingItemId && key) firstNewRowByName.set(key, row.row);
    const fail = (msg: string) => (errors[`row-${row.row}`] ??= msg);
    const name = row.name.trim();
    if (!name) fail("Enter a name.");
    else if (name.length > 200) fail("Name is too long.");
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 1_000_000) fail("Quantity must be a whole number, 1 or more.");
    if (!locations.has(row.locationId)) fail("Choose a location.");
    if (row.boxId) {
      const box = boxes.get(row.boxId);
      if (!box || box.deletedAt || box.status !== "AT_LOCATION" || box.locationId !== row.locationId) {
        fail(`${boxCode(row.boxId)} isn't at that location.`);
      }
    }
    let companyIds: number[] = [];
    let typeName: string | undefined;
    if (row.existingItemId) {
      const item = items.get(row.existingItemId);
      if (!item || item.archivedAt) fail("That existing item is gone or archived.");
    } else {
      const match = matchCompanies(row.companies, companies);
      if (match.error) fail(match.error);
      companyIds = match.ids;
      if (row.type?.trim()) {
        const parsed = typeNameSchema.safeParse(row.type);
        if (parsed.success) typeName = parsed.data;
        else fail("Keep the type under 40 characters.");
      }
    }
    plans.push({ row, companyIds, typeName });
  }
  const bad = Object.keys(errors).length;
  if (bad) throw new UserError(`${bad} row${bad === 1 ? " needs" : "s need"} fixing. Nothing was saved yet.`, errors);

  // Types are looked up (or added) only now, so a batch that needs fixing never leaves new types behind.
  const typeIds = new Map<string, number>();
  for (const { typeName } of plans) {
    const key = typeName?.toLowerCase();
    if (!typeName || !key || typeIds.has(key)) continue;
    typeIds.set(key, (await findOrCreateType(tx, actor, typeName)).type.id);
  }

  let created = 0;
  let addedTo = 0;
  const createdByRow = new Map<number, number>();
  for (const { row, companyIds, typeName, sameAsRow } of plans) {
    let itemId: number;
    if (row.existingItemId) {
      itemId = row.existingItemId;
      addedTo++;
    } else if (sameAsRow) {
      itemId = createdByRow.get(sameAsRow)!;
    } else {
      const typeId = typeName ? (typeIds.get(typeName.toLowerCase()) ?? null) : null;
      itemId = (await createItem(tx, actor, { name: row.name.trim(), companyIds, description: null, lowStockThreshold: null, typeId })).id;
      createdByRow.set(row.row, itemId);
      created++;
    }
    await addStock(tx, actor, {
      itemId,
      quantity: row.quantity,
      place: row.boxId ? { boxId: row.boxId } : { locationId: row.locationId },
    });
  }
  return { created, addedTo };
}
