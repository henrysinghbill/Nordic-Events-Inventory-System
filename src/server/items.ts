/**
 * Item (catalogue entry) changes. Like the stock module, every function takes
 * a transaction and writes its own history entry.
 */
import { z } from "zod";
import type { Tx } from "./db";
import { UserError } from "./errors";
import { logHistory, type Actor } from "./history";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .transform((s) => (s === "" ? null : s))
    .nullish();

export const itemFieldsSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(200, "Keep the name under 200 characters."),
  description: optionalText(2000),
  companyIds: z.array(z.coerce.number().int().positive()).min(1, "Choose at least one company."),
  lowStockThreshold: z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(0, "Can't be negative.")])
    .nullish(),
  /** Optional: what kind of thing it is (see types.ts). Empty means no type. */
  typeId: z.union([z.literal("").transform(() => null), z.coerce.number().int().positive()]).nullish(),
});
export type ItemFields = z.infer<typeof itemFieldsSchema>;

async function checkCompanies(tx: Tx, companyIds: number[]) {
  const ids = [...new Set(companyIds)];
  const companies = await tx.company.findMany({ where: { id: { in: ids } } });
  if (companies.length !== ids.length) throw new UserError("One of the chosen companies no longer exists.");
  return ids;
}

async function checkType(tx: Tx, typeId: number | null | undefined) {
  if (!typeId) return null;
  const type = await tx.itemType.findUnique({ where: { id: typeId } });
  if (!type) throw new UserError("That type no longer exists. Choose another one.", { typeId: "Choose another type." });
  return type;
}

const typeName = (type: { name: string } | null | undefined) => type?.name ?? "none";

export async function createItem(tx: Tx, actor: Actor, fields: ItemFields, opts: { copyOf?: string } = {}) {
  const companyIds = await checkCompanies(tx, fields.companyIds);
  const type = await checkType(tx, fields.typeId);
  const item = await tx.item.create({
    data: {
      name: fields.name,
      description: fields.description ?? null,
      lowStockThreshold: fields.lowStockThreshold ?? null,
      typeId: type?.id ?? null,
      companies: { create: companyIds.map((companyId) => ({ companyId })) },
    },
  });
  await logHistory(tx, actor, {
    action: "ITEM_CREATED",
    summary: `Item "${item.name}" created${opts.copyOf ? ` (duplicate of "${opts.copyOf}")` : ""}`,
    itemId: item.id,
  });
  return item;
}

export async function updateItem(tx: Tx, actor: Actor, itemId: number, fields: ItemFields) {
  const before = await tx.item.findUnique({
    where: { id: itemId },
    include: { companies: { include: { company: true } }, type: true },
  });
  if (!before) throw new UserError("That item doesn't exist.");
  const companyIds = await checkCompanies(tx, fields.companyIds);
  const type = await checkType(tx, fields.typeId);

  await tx.itemCompany.deleteMany({ where: { itemId } });
  const item = await tx.item.update({
    where: { id: itemId },
    data: {
      name: fields.name,
      description: fields.description ?? null,
      lowStockThreshold: fields.lowStockThreshold ?? null,
      typeId: type?.id ?? null,
      companies: { create: companyIds.map((companyId) => ({ companyId })) },
    },
    include: { companies: { include: { company: true } } },
  });

  const changes: string[] = [];
  if (before.name !== item.name) changes.push(`renamed from "${before.name}"`);
  if (before.typeId !== item.typeId) changes.push(`type ${typeName(before.type)} → ${typeName(type)}`);
  if ((before.description ?? "") !== (item.description ?? "")) changes.push("description changed");
  if (before.lowStockThreshold !== item.lowStockThreshold) {
    changes.push(`low-stock threshold ${before.lowStockThreshold ?? "none"} → ${item.lowStockThreshold ?? "none"}`);
  }
  const names = (cs: typeof item.companies) => cs.map((c) => c.company.name).sort().join(", ");
  if (names(before.companies) !== names(item.companies)) changes.push(`companies: ${names(item.companies)}`);

  if (changes.length) {
    await logHistory(tx, actor, {
      action: "ITEM_EDITED",
      summary: `Item "${item.name}" edited: ${changes.join("; ")}`,
      itemId,
    });
  }
  return item;
}

/**
 * Give several items the same type in one go (the "Items without a type"
 * page). Items that already have that type are left alone; `typeId` null
 * removes the type.
 */
export async function setItemsType(tx: Tx, actor: Actor, itemIds: number[], typeId: number | null) {
  const type = await checkType(tx, typeId);
  const items = await tx.item.findMany({
    where: { id: { in: [...new Set(itemIds)] } },
    include: { type: true },
    orderBy: { name: "asc" },
  });
  let changed = 0;
  for (const item of items) {
    if (item.typeId === (type?.id ?? null)) continue;
    await tx.item.update({ where: { id: item.id }, data: { typeId: type?.id ?? null } });
    await logHistory(tx, actor, {
      action: "ITEM_EDITED",
      summary: `Item "${item.name}" edited: type ${typeName(item.type)} → ${typeName(type)}`,
      itemId: item.id,
    });
    changed++;
  }
  return { changed, typeName: type?.name ?? null };
}

export async function setItemArchived(tx: Tx, actor: Actor, itemId: number, archived: boolean) {
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item) throw new UserError("That item doesn't exist.");
  if (Boolean(item.archivedAt) === archived) return item;
  const updated = await tx.item.update({
    where: { id: itemId },
    data: { archivedAt: archived ? new Date() : null },
  });
  await logHistory(tx, actor, {
    action: archived ? "ITEM_ARCHIVED" : "ITEM_RESTORED",
    summary: `Item "${item.name}" ${archived ? "archived" : "restored"}`,
    itemId,
  });
  return updated;
}

/** Attach an already-stored photo file to an item (as the last photo). */
export async function addItemPhoto(
  tx: Tx,
  actor: Actor,
  itemId: number,
  photo: { key: string; width: number; height: number },
) {
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item) throw new UserError("That item doesn't exist.");
  const last = await tx.photo.findFirst({ where: { itemId }, orderBy: { position: "desc" } });
  const created = await tx.photo.create({
    data: { ...photo, itemId, position: last ? last.position + 1 : 0 },
  });
  await logHistory(tx, actor, {
    action: "PHOTO_ADDED",
    summary: `Photo added to "${item.name}"${last ? "" : " (main photo)"}`,
    itemId,
  });
  return created;
}

/** Make a photo the main one (lowest position). */
export async function setMainPhoto(tx: Tx, itemId: number, photoId: number) {
  const photos = await tx.photo.findMany({ where: { itemId }, orderBy: { position: "asc" } });
  if (!photos.some((p) => p.id === photoId)) throw new UserError("That photo doesn't belong to this item.");
  const ordered = [photos.find((p) => p.id === photoId)!, ...photos.filter((p) => p.id !== photoId)];
  for (const [position, p] of ordered.entries()) {
    if (p.position !== position) await tx.photo.update({ where: { id: p.id }, data: { position } });
  }
}

/** Remove a photo record; returns its key so the caller can delete the files after commit. */
export async function removeItemPhoto(tx: Tx, actor: Actor, itemId: number, photoId: number) {
  const photo = await tx.photo.findFirst({ where: { id: photoId, itemId }, include: { item: true } });
  if (!photo) throw new UserError("That photo doesn't exist.");
  await tx.photo.delete({ where: { id: photoId } });
  await logHistory(tx, actor, {
    action: "PHOTO_REMOVED",
    summary: `Photo removed from "${photo.item?.name}"`,
    itemId,
  });
  return photo.key;
}
