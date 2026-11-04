import { beforeEach, describe, expect, it } from "vitest";
import { matchCompanies } from "@/lib/company-match";
import { bulkAdd } from "@/server/bulk";
import type { Tx } from "@/server/db";
import { createItem } from "@/server/items";
import { countMissingPhotos, lowStockItems } from "@/server/queries";
import { addStock, countStock } from "@/server/stock";
import { createBox, packBox, shipBox } from "@/server/stock/boxes";
import { looseQty, makeItem, resetDb, seedBasics, testDb } from "./helpers/db";

let s: Awaited<ReturnType<typeof seedBasics>>;
const tx = <T>(fn: (t: Tx) => Promise<T>) => testDb.$transaction(fn);

beforeEach(async () => {
  await resetDb();
  s = await seedBasics();
});

async function stocked(name: string, quantity: number, locationId = s.cph.id) {
  const item = await makeItem(name, s.nl.id);
  await tx((t) => addStock(t, s.actor, { itemId: item.id, quantity, place: { locationId } }));
  return item;
}

describe("countStock (count / adjust)", () => {
  it("sets the quantity to the counted amount and logs before → after with the reason", async () => {
    const tote = await stocked("Tote bag", 50);
    const r = await tx((t) =>
      countStock(t, s.actor, { itemId: tote.id, place: { locationId: s.cph.id }, actual: 38, reason: "USED_AT_EVENT", note: "Vitafoods" }),
    );
    expect(r).toEqual({ changed: true, before: 50, after: 38 });
    expect(await looseQty(tote.id, s.cph.id)).toBe(38);
    const log = await testDb.historyEntry.findFirstOrThrow({ where: { action: "QUANTITY_ADJUSTED" } });
    expect(log).toMatchObject({ quantity: -12, quantityBefore: 50, quantityAfter: 38, reason: "Used at event", note: "Vitafoods" });
    expect(log.summary).toBe("Tote bag in Copenhagen storeroom counted: 50 → 38 (used at event)");
  });

  it("counting 0 removes the holding", async () => {
    const tote = await stocked("Tote bag", 5);
    await tx((t) => countStock(t, s.actor, { itemId: tote.id, place: { locationId: s.cph.id }, actual: 0, reason: "LOST" }));
    expect(await testDb.holding.count({ where: { itemId: tote.id } })).toBe(0);
  });

  it("can record found stock where none was recorded", async () => {
    const tote = await makeItem("Tote bag", s.nl.id);
    await tx((t) => countStock(t, s.actor, { itemId: tote.id, place: { locationId: s.venue.id }, actual: 3, reason: "FOUND" }));
    expect(await looseQty(tote.id, s.venue.id)).toBe(3);
  });

  it("does nothing (and logs nothing) when the count matches", async () => {
    const tote = await stocked("Tote bag", 5);
    const r = await tx((t) => countStock(t, s.actor, { itemId: tote.id, place: { locationId: s.cph.id }, actual: 5, reason: "CORRECTION" }));
    expect(r.changed).toBe(false);
    expect(await testDb.historyEntry.count({ where: { action: "QUANTITY_ADJUSTED" } })).toBe(0);
  });

  it("adjusts inside a box, but not while the box is in transit", async () => {
    const tote = await stocked("Tote bag", 10);
    const box = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 10 }] }));
    await tx((t) => countStock(t, s.actor, { itemId: tote.id, place: { boxId: box.id }, actual: 9, reason: "DAMAGED" }));
    expect((await testDb.holding.findFirstOrThrow({ where: { boxId: box.id } })).quantity).toBe(9);
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
    await expect(
      tx((t) => countStock(t, s.actor, { itemId: tote.id, place: { boxId: box.id }, actual: 1, reason: "LOST" })),
    ).rejects.toThrow(/in transit/);
  });

  it("requires a valid reason and a non-negative whole number", async () => {
    const tote = await stocked("Tote bag", 5);
    const place = { locationId: s.cph.id };
    await expect(tx((t) => countStock(t, s.actor, { itemId: tote.id, place, actual: 2, reason: "" }))).rejects.toThrow(/reason/);
    await expect(tx((t) => countStock(t, s.actor, { itemId: tote.id, place, actual: -1, reason: "LOST" }))).rejects.toThrow(/0 or more/);
    await expect(tx((t) => countStock(t, s.actor, { itemId: tote.id, place, actual: 1.5, reason: "LOST" }))).rejects.toThrow(/whole/);
    expect(await looseQty(tote.id, s.cph.id)).toBe(5);
  });
});

describe("matchCompanies", () => {
  const companies = [
    { id: 1, name: "Nordic Laboratories" },
    { id: 2, name: "Functional Future" },
    { id: 3, name: "Nordic Health" },
    { id: 4, name: "DNA Life" },
    { id: 5, name: "Simply Nature" },
  ];
  it.each([
    ["Functional Future", [2]],
    ["functional future", [2]],
    ["FF", [2]],
    ["nl, nh", [1, 3]],
    ["dna", [4]],
    ["simply; func", [5, 2]],
    ["labor", [1]],
    ["FF, ff", [2]],
  ])("reads %s", (text, ids) => {
    expect(matchCompanies(text, companies)).toEqual({ ids });
  });

  it("reports ambiguous, unknown and empty input", () => {
    expect(matchCompanies("nordic", companies).error).toMatch(/could be Nordic Laboratories or Nordic Health/);
    expect(matchCompanies("Acme", companies).error).toMatch(/No company matches "acme"/);
    expect(matchCompanies(" , ", companies).error).toMatch(/at least one/);
  });
});

describe("bulkAdd", () => {
  it("creates new items and adds stock to existing ones in one go", async () => {
    const tote = await stocked("Tote bag", 10);
    const box = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
    const r = await tx((t) =>
      bulkAdd(t, s.actor, [
        { row: 1, name: "Roll-up banner", companies: "FF", quantity: 2, locationId: s.cph.id },
        { row: 2, name: "Leaflets", companies: "nl, ff", quantity: 500, locationId: s.cph.id, boxId: box.id },
        { row: 3, name: "Tote bag", companies: "", quantity: 5, locationId: s.cph.id, existingItemId: tote.id },
      ]),
    );
    expect(r).toEqual({ created: 2, addedTo: 1 });
    expect(await looseQty(tote.id, s.cph.id)).toBe(15);
    const leaflets = await testDb.item.findFirstOrThrow({ where: { name: "Leaflets" }, include: { companies: true, holdings: true } });
    expect(leaflets.companies.map((c) => c.companyId).sort()).toEqual([s.nl.id, s.ff.id].sort());
    expect(leaflets.holdings[0]).toMatchObject({ boxId: box.id, quantity: 500 });
  });

  it("treats a repeated new name in the same batch as the same item", async () => {
    const r = await tx((t) =>
      bulkAdd(t, s.actor, [
        { row: 1, name: "Leaflet A5", companies: "NL", quantity: 500, locationId: s.cph.id },
        { row: 2, name: "leaflet a5 ", companies: "", quantity: 100, locationId: s.venue.id },
      ]),
    );
    expect(r).toEqual({ created: 1, addedTo: 0 });
    const items = await testDb.item.findMany({ where: { name: "Leaflet A5" } });
    expect(items).toHaveLength(1);
    expect(await looseQty(items[0].id, s.cph.id)).toBe(500);
    expect(await looseQty(items[0].id, s.venue.id)).toBe(100);
  });

  it("saves nothing if any row is wrong, and names every bad row", async () => {
    const box = await tx((t) => createBox(t, s.actor, { locationId: s.venue.id }));
    let err: unknown;
    try {
      await tx((t) =>
        bulkAdd(t, s.actor, [
          { row: 1, name: "Good row", companies: "FF", quantity: 1, locationId: s.cph.id },
          { row: 2, name: "", companies: "FF", quantity: 1, locationId: s.cph.id },
          { row: 3, name: "Bad company", companies: "Acme", quantity: 1, locationId: s.cph.id },
          { row: 4, name: "Bad qty", companies: "FF", quantity: 0, locationId: s.cph.id },
          { row: 5, name: "Wrong box", companies: "FF", quantity: 1, locationId: s.cph.id, boxId: box.id },
        ]),
      );
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toBe("4 rows need fixing. Nothing was saved yet.");
    expect(Object.keys((err as { fieldErrors: object }).fieldErrors).sort()).toEqual(["row-2", "row-3", "row-4", "row-5"]);
    expect(await testDb.item.count()).toBe(0);
  });
});

describe("warnings", () => {
  it("lists items below their low-stock level, counting boxes and transit but not other items", async () => {
    const tote = await stocked("Tote bag", 3);
    const banner = await stocked("Banner", 10);
    await testDb.item.update({ where: { id: tote.id }, data: { lowStockThreshold: 5 } });
    await testDb.item.update({ where: { id: banner.id }, data: { lowStockThreshold: 10 } });
    const none = await makeItem("Fridge", s.nl.id);
    await testDb.item.update({ where: { id: none.id }, data: { lowStockThreshold: 1 } });
    const low = await lowStockItems(testDb);
    expect(low.map((l) => [l.name, l.total, l.threshold])).toEqual([
      ["Fridge", 0, 1],
      ["Tote bag", 3, 5],
    ]);
  });

  it("counts active items without a photo", async () => {
    await makeItem("No photo", s.nl.id);
    const withPhoto = await makeItem("Has photo", s.nl.id);
    await testDb.photo.create({ data: { key: "00000000-0000-0000-0000-000000000000", itemId: withPhoto.id, width: 1, height: 1 } });
    const archived = await makeItem("Archived", s.nl.id);
    await testDb.item.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    expect(await countMissingPhotos(testDb)).toBe(1);
  });

  it("records duplicates in history", async () => {
    const item = await tx((t) => createItem(t, s.actor, { name: "Tote bag (blue)", companyIds: [s.nl.id] }, { copyOf: "Tote bag" }));
    const log = await testDb.historyEntry.findFirstOrThrow({ where: { itemId: item.id } });
    expect(log.summary).toBe('Item "Tote bag (blue)" created (duplicate of "Tote bag")');
  });
});
