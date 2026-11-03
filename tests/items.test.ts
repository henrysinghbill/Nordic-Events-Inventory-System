import { beforeEach, describe, expect, it } from "vitest";
import { parseInput } from "@/server/errors";
import { createItem, itemFieldsSchema, setItemArchived, updateItem } from "@/server/items";
import { resetDb, seedBasics, testDb } from "./helpers/db";

let s: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb();
  s = await seedBasics();
});

describe("item fields validation", () => {
  it("requires a name and at least one company", () => {
    expect(() => parseInput(itemFieldsSchema, { name: "  ", companyIds: [1] })).toThrow("Enter a name.");
    expect(() => parseInput(itemFieldsSchema, { name: "Banner", companyIds: [] })).toThrow(
      "Choose at least one company.",
    );
  });

  it("turns empty optional fields into null", () => {
    const parsed = parseInput(itemFieldsSchema, {
      name: " Banner ",
      description: "",
      companyIds: ["1", "2"],
      lowStockThreshold: "",
    });
    expect(parsed).toEqual({ name: "Banner", description: null, companyIds: [1, 2], lowStockThreshold: null });
  });
});

describe("items", () => {
  it("creates an item with several companies and logs it", async () => {
    const item = await testDb.$transaction((tx) =>
      createItem(tx, s.actor, { name: "Roll-up", companyIds: [s.nl.id, s.ff.id] }),
    );
    const links = await testDb.itemCompany.findMany({ where: { itemId: item.id } });
    expect(links.map((l) => l.companyId).sort()).toEqual([s.nl.id, s.ff.id].sort());
    expect(await testDb.historyEntry.count({ where: { itemId: item.id, action: "ITEM_CREATED" } })).toBe(1);
  });

  it("records what changed when an item is edited", async () => {
    const item = await testDb.$transaction((tx) =>
      createItem(tx, s.actor, { name: "Roll-up", companyIds: [s.nl.id] }),
    );
    await testDb.$transaction((tx) =>
      updateItem(tx, s.actor, item.id, { name: "Roll-up banner", companyIds: [s.ff.id], lowStockThreshold: 2 }),
    );
    const entry = await testDb.historyEntry.findFirstOrThrow({ where: { action: "ITEM_EDITED" } });
    expect(entry.summary).toContain('renamed from "Roll-up"');
    expect(entry.summary).toContain("companies: Functional Future");
    expect(entry.summary).toContain("low-stock threshold none → 2");
  });

  it("archives and restores", async () => {
    const item = await testDb.$transaction((tx) =>
      createItem(tx, s.actor, { name: "Fridge", companyIds: [s.nl.id] }),
    );
    await testDb.$transaction((tx) => setItemArchived(tx, s.actor, item.id, true));
    expect((await testDb.item.findUniqueOrThrow({ where: { id: item.id } })).archivedAt).not.toBeNull();
    await testDb.$transaction((tx) => setItemArchived(tx, s.actor, item.id, false));
    expect((await testDb.item.findUniqueOrThrow({ where: { id: item.id } })).archivedAt).toBeNull();
  });
});
