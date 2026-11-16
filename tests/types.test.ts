import { beforeEach, describe, expect, it } from "vitest";
import { bulkAdd } from "@/server/bulk";
import type { Tx } from "@/server/db";
import { parseInput } from "@/server/errors";
import { createItem, itemFieldsSchema, setItemsType, updateItem } from "@/server/items";
import { deleteType, findOrCreateType, renameType, typeNameSchema } from "@/server/types";
import { makeItem, resetDb, seedBasics, testDb } from "./helpers/db";

let s: Awaited<ReturnType<typeof seedBasics>>;
const tx = <T>(fn: (t: Tx) => Promise<T>) => testDb.$transaction(fn);
const addType = (name: string) => tx((t) => findOrCreateType(t, s.actor, name));

beforeEach(async () => {
  await resetDb();
  s = await seedBasics();
});

describe("item types", () => {
  it("adds a type with a capital letter, once, and logs it", async () => {
    const first = await addType("banner");
    expect(first).toMatchObject({ created: true, type: { name: "Banner" } });
    // Any capitals find the same type again.
    for (const name of ["Banner", "BANNER", "banner"]) {
      const again = await addType(name);
      expect(again).toMatchObject({ created: false, type: { id: first.type.id, name: "Banner" } });
    }
    expect(await testDb.itemType.count()).toBe(1);
    const log = await testDb.historyEntry.findMany({ where: { action: "TYPE_CREATED" } });
    expect(log.map((l) => l.summary)).toEqual(['Item type "Banner" added']);
  });

  it("tidies names and refuses empty or very long ones", () => {
    expect(parseInput(typeNameSchema, "  roll-up   banner ")).toBe("roll-up banner");
    expect(() => parseInput(typeNameSchema, "   ")).toThrow("Enter a name.");
    expect(() => parseInput(typeNameSchema, "x".repeat(41))).toThrow("under 40 characters");
  });

  it("the database itself refuses the same name in different capitals", async () => {
    await addType("Banner");
    await expect(testDb.itemType.create({ data: { name: "bAnner" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("renames, but not onto another type's name", async () => {
    const banner = (await addType("Banner")).type;
    await addType("Leaflet");
    await expect(tx((t) => renameType(t, s.actor, banner.id, "leaflet"))).rejects.toThrow('"Leaflet" already exists.');
    // Changing only the capitals of its own name is fine.
    await tx((t) => renameType(t, s.actor, banner.id, "BANNER"));
    await tx((t) => renameType(t, s.actor, banner.id, "Roll-up banner"));
    expect((await testDb.itemType.findUniqueOrThrow({ where: { id: banner.id } })).name).toBe("Roll-up banner");
    const log = await testDb.historyEntry.findMany({ where: { action: "TYPE_RENAMED" }, orderBy: { id: "asc" } });
    expect(log.map((l) => l.summary)).toEqual([
      'Item type "Banner" renamed to "BANNER"',
      'Item type "BANNER" renamed to "Roll-up banner"',
    ]);
  });

  it("deleting a type keeps its items, without a type", async () => {
    const banner = (await addType("Banner")).type;
    const item = await tx((t) => createItem(t, s.actor, { name: "Roll-up", companyIds: [s.nl.id], typeId: banner.id }));
    const other = await makeItem("Tote bag", s.nl.id);
    expect(await tx((t) => deleteType(t, s.actor, banner.id))).toBe(1);
    expect((await testDb.item.findUniqueOrThrow({ where: { id: item.id } })).typeId).toBeNull();
    expect(await testDb.item.count()).toBe(2);
    expect((await testDb.item.findUniqueOrThrow({ where: { id: other.id } })).typeId).toBeNull();
    const log = await testDb.historyEntry.findFirstOrThrow({ where: { action: "TYPE_DELETED" } });
    expect(log.summary).toBe('Item type "Banner" deleted (1 item now has no type)');
  });
});

describe("items with a type", () => {
  it("reads the type from a form: a number, or empty for none", () => {
    const base = { name: "Banner", companyIds: ["1"] };
    expect(parseInput(itemFieldsSchema, { ...base, typeId: "7" }).typeId).toBe(7);
    expect(parseInput(itemFieldsSchema, { ...base, typeId: "" }).typeId).toBeNull();
    expect(parseInput(itemFieldsSchema, { ...base, typeId: null }).typeId).toBeNull();
    expect(parseInput(itemFieldsSchema, base).typeId).toBeUndefined();
  });

  it("saves the type, and records changes to it in the item's history", async () => {
    const banner = (await addType("Banner")).type;
    const leaflet = (await addType("Leaflet")).type;
    const item = await tx((t) => createItem(t, s.actor, { name: "Roll-up", companyIds: [s.nl.id], typeId: banner.id }));
    expect(item.typeId).toBe(banner.id);

    await tx((t) => updateItem(t, s.actor, item.id, { name: "Roll-up", companyIds: [s.nl.id], typeId: leaflet.id }));
    await tx((t) => updateItem(t, s.actor, item.id, { name: "Roll-up", companyIds: [s.nl.id], typeId: null }));
    // Saving again without changing anything adds no history.
    await tx((t) => updateItem(t, s.actor, item.id, { name: "Roll-up", companyIds: [s.nl.id], typeId: null }));
    const log = await testDb.historyEntry.findMany({ where: { itemId: item.id, action: "ITEM_EDITED" }, orderBy: { id: "asc" } });
    expect(log.map((l) => l.summary)).toEqual([
      'Item "Roll-up" edited: type Banner → Leaflet',
      'Item "Roll-up" edited: type Leaflet → none',
    ]);
  });

  it("refuses a type that no longer exists", async () => {
    await expect(
      tx((t) => createItem(t, s.actor, { name: "Roll-up", companyIds: [s.nl.id], typeId: 999 })),
    ).rejects.toThrow("That type no longer exists");
    expect(await testDb.item.count()).toBe(0);
  });

  it("gives several items a type in one go, leaving alone those that already have it", async () => {
    const banner = (await addType("Banner")).type;
    const a = await makeItem("Roll-up A", s.nl.id);
    const b = await makeItem("Roll-up B", s.nl.id);
    const c = await tx((t) => createItem(t, s.actor, { name: "Roll-up C", companyIds: [s.nl.id], typeId: banner.id }));
    const untouched = await makeItem("Tote bag", s.nl.id);

    const result = await tx((t) => setItemsType(t, s.actor, [a.id, b.id, c.id, a.id], banner.id));
    expect(result).toEqual({ changed: 2, typeName: "Banner" });
    const typed = await testDb.item.findMany({ where: { typeId: banner.id }, orderBy: { name: "asc" } });
    expect(typed.map((i) => i.name)).toEqual(["Roll-up A", "Roll-up B", "Roll-up C"]);
    expect((await testDb.item.findUniqueOrThrow({ where: { id: untouched.id } })).typeId).toBeNull();
    const log = await testDb.historyEntry.findMany({ where: { action: "ITEM_EDITED" }, orderBy: { id: "asc" } });
    expect(log.map((l) => l.summary)).toEqual([
      'Item "Roll-up A" edited: type none → Banner',
      'Item "Roll-up B" edited: type none → Banner',
    ]);
  });
});

describe("bulk entry with types", () => {
  it("uses existing types whatever the capitals, and adds new ones once", async () => {
    const banner = (await addType("Banner")).type;
    const r = await tx((t) =>
      bulkAdd(t, s.actor, [
        { row: 1, name: "FuFu roll-up", type: "banner", companies: "FF", quantity: 2, locationId: s.cph.id },
        { row: 2, name: "A5 flyer", type: " leaflet ", companies: "NL", quantity: 500, locationId: s.cph.id },
        { row: 3, name: "A4 flyer", type: "Leaflet", companies: "NL", quantity: 200, locationId: s.cph.id },
        { row: 4, name: "Tote bag", type: "", companies: "NL", quantity: 50, locationId: s.cph.id },
      ]),
    );
    expect(r).toEqual({ created: 4, addedTo: 0 });
    const types = await testDb.itemType.findMany({ orderBy: { name: "asc" } });
    expect(types.map((t) => t.name)).toEqual(["Banner", "Leaflet"]);
    const typeOf = async (name: string) => (await testDb.item.findFirstOrThrow({ where: { name }, include: { type: true } })).type?.name ?? null;
    expect(await typeOf("FuFu roll-up")).toBe("Banner");
    expect((await testDb.item.findFirstOrThrow({ where: { name: "FuFu roll-up" } })).typeId).toBe(banner.id);
    expect(await typeOf("A5 flyer")).toBe("Leaflet");
    expect(await typeOf("A4 flyer")).toBe("Leaflet");
    expect(await typeOf("Tote bag")).toBeNull();
  });

  it("ignores the type for rows that add stock to an existing item", async () => {
    const banner = (await addType("Banner")).type;
    const tote = await makeItem("Tote bag", s.nl.id);
    await tx((t) =>
      bulkAdd(t, s.actor, [{ row: 1, name: "Tote bag", type: "Banner", companies: "", quantity: 5, locationId: s.cph.id, existingItemId: tote.id }]),
    );
    expect((await testDb.item.findUniqueOrThrow({ where: { id: tote.id } })).typeId).toBeNull();
    expect(await testDb.item.count({ where: { typeId: banner.id } })).toBe(0);
  });

  it("a batch that needs fixing adds no types", async () => {
    await expect(
      tx((t) =>
        bulkAdd(t, s.actor, [
          { row: 1, name: "A5 flyer", type: "Leaflet", companies: "NL", quantity: 500, locationId: s.cph.id },
          { row: 2, name: "Too long", type: "x".repeat(41), companies: "NL", quantity: 1, locationId: s.cph.id },
          { row: 3, name: "Bad company", type: "Leaflet", companies: "Acme", quantity: 1, locationId: s.cph.id },
        ]),
      ),
    ).rejects.toMatchObject({
      message: "2 rows need fixing. Nothing was saved yet.",
      fieldErrors: { "row-2": "Keep the type under 40 characters.", "row-3": 'No company matches "acme".' },
    });
    expect(await testDb.itemType.count()).toBe(0);
    expect(await testDb.item.count()).toBe(0);
  });
});
