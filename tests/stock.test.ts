import { beforeEach, describe, expect, it } from "vitest";
import { UserError } from "@/server/errors";
import { runOnce } from "@/server/idempotency";
import { addStock, removeFromHolding, totalQuantity } from "@/server/stock";
import { looseQty, makeItem, resetDb, seedBasics, testDb } from "./helpers/db";

let s: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb();
  s = await seedBasics();
});

describe("addStock", () => {
  it("creates a loose holding and logs it", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    await testDb.$transaction((tx) =>
      addStock(tx, s.actor, { itemId: item.id, quantity: 50, place: { locationId: s.cph.id } }),
    );
    expect(await looseQty(item.id, s.cph.id)).toBe(50);

    const log = await testDb.historyEntry.findMany({ where: { itemId: item.id } });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: "STOCK_ADDED",
      quantity: 50,
      quantityBefore: 0,
      quantityAfter: 50,
      locationId: s.cph.id,
      userName: "Test User",
    });
    expect(log[0].summary).toBe("50 × Tote bag added to Copenhagen storeroom");
  });

  it("merges into the existing loose holding instead of creating a second one", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    for (const quantity of [50, 20]) {
      await testDb.$transaction((tx) =>
        addStock(tx, s.actor, { itemId: item.id, quantity, place: { locationId: s.cph.id } }),
      );
    }
    const holdings = await testDb.holding.findMany({ where: { itemId: item.id } });
    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(70);
  });

  it("keeps stock at different locations separate", async () => {
    const item = await makeItem("Banner", s.ff.id);
    await testDb.$transaction(async (tx) => {
      await addStock(tx, s.actor, { itemId: item.id, quantity: 2, place: { locationId: s.cph.id } });
      await addStock(tx, s.actor, { itemId: item.id, quantity: 1, place: { locationId: s.venue.id } });
    });
    expect(await looseQty(item.id, s.cph.id)).toBe(2);
    expect(await looseQty(item.id, s.venue.id)).toBe(1);
    expect(await totalQuantity(testDb, item.id)).toBe(3);
  });

  it.each([0, -5, 1.5, Number.NaN])("rejects quantity %s", async (quantity) => {
    const item = await makeItem("Tote bag", s.nl.id);
    await expect(
      testDb.$transaction((tx) =>
        addStock(tx, s.actor, { itemId: item.id, quantity, place: { locationId: s.cph.id } }),
      ),
    ).rejects.toThrow(UserError);
    expect(await testDb.holding.count()).toBe(0);
    expect(await testDb.historyEntry.count()).toBe(0);
  });

  it("rejects archived items and archived locations", async () => {
    const item = await makeItem("Old leaflet", s.nl.id);
    await testDb.item.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
    await expect(
      testDb.$transaction((tx) =>
        addStock(tx, s.actor, { itemId: item.id, quantity: 1, place: { locationId: s.cph.id } }),
      ),
    ).rejects.toThrow(/archived/);

    const item2 = await makeItem("New leaflet", s.nl.id);
    await testDb.location.update({ where: { id: s.venue.id }, data: { archivedAt: new Date() } });
    await expect(
      testDb.$transaction((tx) =>
        addStock(tx, s.actor, { itemId: item2.id, quantity: 1, place: { locationId: s.venue.id } }),
      ),
    ).rejects.toThrow(/archived/);
  });

  it("adds into a box at a location, but not into a box in transit or a deleted box", async () => {
    const item = await makeItem("Sample sachet", s.nl.id);
    const box = await testDb.box.create({ data: { locationId: s.cph.id } });
    await testDb.$transaction((tx) =>
      addStock(tx, s.actor, { itemId: item.id, quantity: 100, place: { boxId: box.id } }),
    );
    const inBox = await testDb.holding.findFirst({ where: { boxId: box.id } });
    expect(inBox).toMatchObject({ quantity: 100, locationId: null });

    const moving = await testDb.box.create({
      data: { status: "IN_TRANSIT", originId: s.cph.id, destinationId: s.venue.id },
    });
    await expect(
      testDb.$transaction((tx) =>
        addStock(tx, s.actor, { itemId: item.id, quantity: 1, place: { boxId: moving.id } }),
      ),
    ).rejects.toThrow(/in transit/);

    const gone = await testDb.box.create({ data: { locationId: s.cph.id, deletedAt: new Date() } });
    await expect(
      testDb.$transaction((tx) =>
        addStock(tx, s.actor, { itemId: item.id, quantity: 1, place: { boxId: gone.id } }),
      ),
    ).rejects.toThrow(/doesn't exist/);
  });
});

describe("removeFromHolding", () => {
  async function stock(quantity: number) {
    const item = await makeItem("Tote bag", s.nl.id);
    const h = await testDb.$transaction((tx) =>
      addStock(tx, s.actor, { itemId: item.id, quantity, place: { locationId: s.cph.id } }),
    );
    return { item, holdingId: h.id };
  }

  it("takes part of a holding", async () => {
    const { item, holdingId } = await stock(10);
    await testDb.$transaction((tx) => removeFromHolding(tx, holdingId, 4));
    expect(await looseQty(item.id, s.cph.id)).toBe(6);
  });

  it("deletes the holding when everything is taken", async () => {
    const { holdingId } = await stock(10);
    await testDb.$transaction((tx) => removeFromHolding(tx, holdingId, 10));
    expect(await testDb.holding.findUnique({ where: { id: holdingId } })).toBeNull();
  });

  it("refuses to take more than is there and changes nothing", async () => {
    const { item, holdingId } = await stock(3);
    await expect(testDb.$transaction((tx) => removeFromHolding(tx, holdingId, 4))).rejects.toThrow(
      "Only 3 of Tote bag available, not 4.",
    );
    expect(await looseQty(item.id, s.cph.id)).toBe(3);
  });

  it("never goes negative when two people take stock at the same time", async () => {
    const { item, holdingId } = await stock(10);
    const results = await Promise.allSettled([
      testDb.$transaction((tx) => removeFromHolding(tx, holdingId, 6)),
      testDb.$transaction((tx) => removeFromHolding(tx, holdingId, 6)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await looseQty(item.id, s.cph.id)).toBe(4);
  });
});

describe("database safety rules", () => {
  it("rejects a holding that is both in a box and loose", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    const box = await testDb.box.create({ data: { locationId: s.cph.id } });
    await expect(
      testDb.holding.create({
        data: { itemId: item.id, quantity: 1, boxId: box.id, locationId: s.cph.id },
      }),
    ).rejects.toThrow();
  });

  it("rejects a holding that is nowhere", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    await expect(testDb.holding.create({ data: { itemId: item.id, quantity: 1 } })).rejects.toThrow();
  });

  it("rejects zero and negative quantities", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    for (const quantity of [0, -1]) {
      await expect(
        testDb.holding.create({ data: { itemId: item.id, quantity, locationId: s.cph.id } }),
      ).rejects.toThrow();
    }
  });
});

describe("runOnce (retry after a lost connection)", () => {
  it("applies the same request only once", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    const add = () =>
      runOnce(testDb, s.actor.id, "req-123", async (tx) => {
        await addStock(tx, s.actor, { itemId: item.id, quantity: 5, place: { locationId: s.cph.id } });
        return { itemId: item.id };
      });
    const first = await add();
    const second = await add();
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual({ itemId: item.id });
    expect(await looseQty(item.id, s.cph.id)).toBe(5);
  });

  it("applies concurrent duplicates only once", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    const add = () =>
      runOnce(testDb, s.actor.id, "req-456", async (tx) => {
        await addStock(tx, s.actor, { itemId: item.id, quantity: 5, place: { locationId: s.cph.id } });
        return { ok: true };
      });
    await Promise.all([add(), add(), add()]);
    expect(await looseQty(item.id, s.cph.id)).toBe(5);
  });

  it("does not record a request whose work failed, so it can be retried", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    await expect(
      runOnce(testDb, s.actor.id, "req-789", async () => {
        throw new UserError("nope");
      }),
    ).rejects.toThrow("nope");
    const retry = await runOnce(testDb, s.actor.id, "req-789", async (tx) => {
      await addStock(tx, s.actor, { itemId: item.id, quantity: 1, place: { locationId: s.cph.id } });
      return { ok: true };
    });
    expect(retry.replayed).toBe(false);
    expect(await looseQty(item.id, s.cph.id)).toBe(1);
  });
});
