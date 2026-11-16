/**
 * Item types (Banner, Leaflet, Booklet…): an optional label on each item for
 * quicker lookup. Like the rest of the server code, every function takes a
 * transaction and writes its own history entry.
 *
 * Anyone signed in can add a type while filling in an item; renaming and
 * deleting is for administrators (More → Item types).
 */
import { z } from "zod";
import { plural } from "@/lib/format";
import type { Tx } from "./db";
import { UserError } from "./errors";
import { logHistory, type Actor } from "./history";

export const typeNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(40, "Keep the name under 40 characters.")
  .transform((s) => s.replace(/\s+/g, " "));

/** The type with this name, whatever the capitals ("banner" finds "Banner"). */
async function findByName(tx: Tx, name: string) {
  const rows = await tx.$queryRaw<{ id: number; name: string }[]>`
    SELECT id, name FROM "ItemType" WHERE lower(name) = lower(${name}) LIMIT 1`;
  return rows[0] ?? null;
}

/** New types start with a capital letter, so the list looks tidy ("banner" → "Banner"). */
function tidy(name: string): string {
  return name.charAt(0).toLocaleUpperCase("en-GB") + name.slice(1);
}

/** The type with this name, created if it doesn't exist yet. */
export async function findOrCreateType(tx: Tx, actor: Actor, name: string) {
  const existing = await findByName(tx, name);
  if (existing) return { type: existing, created: false };
  const type = await tx.itemType.create({ data: { name: tidy(name) }, select: { id: true, name: true } });
  await logHistory(tx, actor, { action: "TYPE_CREATED", summary: `Item type "${type.name}" added` });
  return { type, created: true };
}

export async function renameType(tx: Tx, actor: Actor, id: number, name: string) {
  const type = await tx.itemType.findUnique({ where: { id } });
  if (!type) throw new UserError("That type doesn't exist.");
  if (type.name === name) return type;
  const clash = await findByName(tx, name);
  if (clash && clash.id !== id) {
    throw new UserError(`"${clash.name}" already exists.`, { name: "That name is already used." });
  }
  const updated = await tx.itemType.update({ where: { id }, data: { name } });
  await logHistory(tx, actor, { action: "TYPE_RENAMED", summary: `Item type "${type.name}" renamed to "${name}"` });
  return updated;
}

/** Delete a type. Its items stay; they just have no type afterwards. Returns how many that is. */
export async function deleteType(tx: Tx, actor: Actor, id: number): Promise<number> {
  const type = await tx.itemType.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
  if (!type) throw new UserError("That type doesn't exist.");
  await tx.itemType.delete({ where: { id } }); // the database clears it from its items
  const count = type._count.items;
  await logHistory(tx, actor, {
    action: "TYPE_DELETED",
    summary: `Item type "${type.name}" deleted${count ? ` (${plural(count, "item")} now ${count === 1 ? "has" : "have"} no type)` : ""}`,
  });
  return count;
}
