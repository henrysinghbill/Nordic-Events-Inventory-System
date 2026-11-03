import { beforeEach, describe, expect, it } from "vitest";
import type { Tx } from "@/server/db";
import { addStock } from "@/server/stock";
import {
  arriveBox,
  createBox,
  deleteBox,
  linkBarcode,
  packBox,
  resolveScan,
  shipBox,
  unpackBox,
} from "@/server/stock/boxes";
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
const boxQty = async (itemId: number, boxId: number) =>
  (await testDb.holding.findUnique({ where: { itemId_boxId: { itemId, boxId } } }))?.quantity ?? 0;
const newBox = (locationId = s.cph.id) => tx((t) => createBox(t, s.actor, { locationId }));

describe("createBox", () => {
  it("numbers boxes from a running sequence that is never reused", async () => {
    const a = await newBox();
    const b = await newBox();
    await tx((t) => deleteBox(t, s.actor, b.id));
    const c = await newBox();
    expect([a.id, b.id, c.id]).toEqual([1, 2, 3]);
  });
});

describe("packBox", () => {
  it("moves quantities from loose stock into the box", async () => {
    const tote = await stocked("Tote bag", 50);
    const box = await newBox();
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 30 }] }));
    expect(await looseQty(tote.id, s.cph.id)).toBe(20);
    expect(await boxQty(tote.id, box.id)).toBe(30);
  });

  it("packing everything removes the loose holding", async () => {
    const tote = await stocked("Tote bag", 5);
    const box = await newBox();
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 5 }] }));
    expect(await testDb.holding.count({ where: { itemId: tote.id, locationId: s.cph.id } })).toBe(0);
  });

  it("can't pack more than is available, and changes nothing if any line fails", async () => {
    const tote = await stocked("Tote bag", 10);
    const banner = await stocked("Banner", 1);
    const box = await newBox();
    await expect(
      tx((t) =>
        packBox(t, s.actor, {
          boxId: box.id,
          lines: [
            { itemId: tote.id, quantity: 10 },
            { itemId: banner.id, quantity: 2 },
          ],
        }),
      ),
    ).rejects.toThrow("Only 1 of Banner available, not 2.");
    expect(await looseQty(tote.id, s.cph.id)).toBe(10);
    expect(await boxQty(tote.id, box.id)).toBe(0);
  });

  it("only packs stock from the box's own location", async () => {
    const tote = await stocked("Tote bag", 10, s.venue.id);
    const box = await newBox(s.cph.id);
    await expect(
      tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 1 }] })),
    ).rejects.toThrow(/isn't in the loose stock/);
  });

  it("combines duplicate lines and ignores zero lines", async () => {
    const tote = await stocked("Tote bag", 10);
    const banner = await stocked("Banner", 3);
    const box = await newBox();
    await tx((t) =>
      packBox(t, s.actor, {
        boxId: box.id,
        lines: [
          { itemId: tote.id, quantity: 2 },
          { itemId: tote.id, quantity: 3 },
          { itemId: banner.id, quantity: 0 },
        ],
      }),
    );
    expect(await boxQty(tote.id, box.id)).toBe(5);
    expect(await looseQty(banner.id, s.cph.id)).toBe(3);
  });

  it("rejects an all-zero packing list and a box in transit", async () => {
    const tote = await stocked("Tote bag", 10);
    const box = await newBox();
    await expect(
      tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 0 }] })),
    ).rejects.toThrow(/at least one item/);
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
    await expect(
      tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 1 }] })),
    ).rejects.toThrow(/in transit/);
  });

  it("works at an event venue too", async () => {
    const tote = await stocked("Tote bag", 4, s.venue.id);
    const box = await newBox(s.venue.id);
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 4 }] }));
    expect(await boxQty(tote.id, box.id)).toBe(4);
  });
});

describe("unpackBox", () => {
  async function packed() {
    const tote = await stocked("Tote bag", 50);
    const banner = await stocked("Banner", 2);
    const box = await newBox();
    await tx((t) =>
      packBox(t, s.actor, {
        boxId: box.id,
        lines: [
          { itemId: tote.id, quantity: 40 },
          { itemId: banner.id, quantity: 2 },
        ],
      }),
    );
    return { tote, banner, box };
  }

  it("partly unpacks and merges into existing loose stock", async () => {
    const { tote, box } = await packed();
    const r = await tx((t) => unpackBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 15 }] }));
    expect(r.empty).toBe(false);
    expect(await looseQty(tote.id, s.cph.id)).toBe(25); // 10 left loose + 15
    expect(await boxQty(tote.id, box.id)).toBe(25);
    expect(await testDb.holding.count({ where: { itemId: tote.id, locationId: s.cph.id } })).toBe(1);
  });

  it("reports when the box is empty", async () => {
    const { tote, banner, box } = await packed();
    const r = await tx((t) =>
      unpackBox(t, s.actor, {
        boxId: box.id,
        lines: [
          { itemId: tote.id, quantity: 40 },
          { itemId: banner.id, quantity: 2 },
        ],
      }),
    );
    expect(r.empty).toBe(true);
    expect(await looseQty(banner.id, s.cph.id)).toBe(2);
  });

  it("can't unpack more than is in the box", async () => {
    const { banner, box } = await packed();
    await expect(
      tx((t) => unpackBox(t, s.actor, { boxId: box.id, lines: [{ itemId: banner.id, quantity: 3 }] })),
    ).rejects.toThrow("Only 2 of Banner available, not 3.");
  });

  it("unpacks into the location where the box now is", async () => {
    const { tote, box } = await packed();
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
    await tx((t) => arriveBox(t, s.actor, { boxId: box.id, locationId: s.venue.id }));
    await tx((t) => unpackBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 40 }] }));
    expect(await looseQty(tote.id, s.venue.id)).toBe(40);
  });
});

describe("shipping and arriving", () => {
  it("ships a box (in transit, no location) and logs each item", async () => {
    const tote = await stocked("Tote bag", 50);
    const box = await newBox();
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 50 }] }));
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
    const b = await testDb.box.findUniqueOrThrow({ where: { id: box.id } });
    expect(b).toMatchObject({ status: "IN_TRANSIT", locationId: null, originId: s.cph.id, destinationId: s.venue.id });
    const log = await testDb.historyEntry.findFirstOrThrow({ where: { action: "SHIPPED" } });
    expect(log).toMatchObject({ itemId: tote.id, quantity: 50, fromLocationId: s.cph.id, toLocationId: s.venue.id });
    expect(log.summary).toBe("50 × Tote bag in BOX-0001 shipped from Copenhagen storeroom to Vitafoods Barcelona");
  });

  it("can't ship to where it already is, or ship twice", async () => {
    const box = await newBox();
    await expect(tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.cph.id }))).rejects.toThrow(
      /already at/,
    );
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
    await expect(tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.cph.id }))).rejects.toThrow(
      /in transit/,
    );
  });

  it("only one of two simultaneous shipments succeeds", async () => {
    const box = await newBox();
    const results = await Promise.allSettled([
      tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id })),
      tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("arrives at the expected destination or a different one", async () => {
    const tote = await stocked("Tote bag", 5);
    const box = await newBox();
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 5 }] }));
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
    const oslo = await testDb.location.create({ data: { name: "Oslo storage", country: "Norway", type: "STORAGE" } });
    await tx((t) => arriveBox(t, s.actor, { boxId: box.id, locationId: oslo.id }));
    const b = await testDb.box.findUniqueOrThrow({ where: { id: box.id } });
    expect(b).toMatchObject({ status: "AT_LOCATION", locationId: oslo.id, originId: null, destinationId: null });
    const log = await testDb.historyEntry.findFirstOrThrow({ where: { action: "ARRIVED" } });
    expect(log.summary).toBe("5 × Tote bag in BOX-0001 arrived at Oslo storage (was heading to Vitafoods Barcelona)");
    expect(log).toMatchObject({ fromLocationId: s.cph.id, toLocationId: oslo.id, locationId: oslo.id });
  });

  it("can't mark a box that isn't in transit as arrived", async () => {
    const box = await newBox();
    await expect(tx((t) => arriveBox(t, s.actor, { boxId: box.id, locationId: s.venue.id }))).rejects.toThrow(
      /isn't in transit/,
    );
  });

  it("quantities are unchanged by a round trip", async () => {
    const tote = await stocked("Tote bag", 50);
    const box = await newBox();
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 50 }] }));
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
    await tx((t) => arriveBox(t, s.actor, { boxId: box.id, locationId: s.venue.id }));
    await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.cph.id }));
    await tx((t) => arriveBox(t, s.actor, { boxId: box.id, locationId: s.cph.id }));
    await tx((t) => unpackBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 50 }] }));
    expect(await looseQty(tote.id, s.cph.id)).toBe(50);
    expect((await testDb.holding.aggregate({ _sum: { quantity: true } }))._sum.quantity).toBe(50);
  });
});

describe("deleteBox", () => {
  it("refuses to delete a box with contents", async () => {
    const tote = await stocked("Tote bag", 5);
    const box = await newBox();
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 1 }] }));
    await expect(tx((t) => deleteBox(t, s.actor, box.id))).rejects.toThrow(/Unpack it first/);
  });

  it("soft-deletes an empty box and keeps its history", async () => {
    const box = await newBox();
    await tx((t) => deleteBox(t, s.actor, box.id));
    const b = await testDb.box.findUniqueOrThrow({ where: { id: box.id } });
    expect(b.deletedAt).not.toBeNull();
    expect(await testDb.historyEntry.count({ where: { boxId: box.id } })).toBe(2);
    await expect(tx((t) => deleteBox(t, s.actor, box.id))).rejects.toThrow(/doesn't exist/);
  });
});

describe("barcodes", () => {
  it("links piece IDs (normalised) and resolves both printed and scanned forms", async () => {
    const box = await newBox();
    await tx((t) => linkBarcode(t, s.actor, box.id, "(J) JD01 4600 0129 0160 4680"));
    expect(await tx((t) => resolveScan(t, "JJD014600012901604680"))).toEqual({ result: "box", code: "BOX-0001" });
  });

  it("a piece ID can't be linked to two boxes", async () => {
    const a = await newBox();
    const b = await newBox();
    await tx((t) => linkBarcode(t, s.actor, a.id, "JJD014600012901604680"));
    await expect(tx((t) => linkBarcode(t, s.actor, b.id, "JD014600012901604680"))).rejects.toThrow(
      /already linked to BOX-0001/,
    );
  });

  it("linking the same barcode to the same box twice is harmless", async () => {
    const a = await newBox();
    await tx((t) => linkBarcode(t, s.actor, a.id, "JJD014600012901604680"));
    const again = await tx((t) => linkBarcode(t, s.actor, a.id, "JJD014600012901604680"));
    expect(again.alreadyLinked).toBe(true);
    expect(await testDb.barcode.count()).toBe(1);
  });

  it("a waybill can be shared; scanning it offers the choice", async () => {
    const a = await newBox();
    const b = await newBox();
    await tx((t) => linkBarcode(t, s.actor, a.id, "WAYBILL 64 5655 6024"));
    expect(await tx((t) => resolveScan(t, "6456556024"))).toEqual({ result: "box", code: "BOX-0001" });
    await tx((t) => linkBarcode(t, s.actor, b.id, "6456556024"));
    const r = await tx((t) => resolveScan(t, "6456556024"));
    expect(r).toEqual({
      result: "choose",
      boxes: [
        { code: "BOX-0001", where: "at Copenhagen storeroom" },
        { code: "BOX-0002", where: "at Copenhagen storeroom" },
      ],
    });
  });

  it("rejects routing barcodes and app labels when linking", async () => {
    const a = await newBox();
    await expect(tx((t) => linkBarcode(t, s.actor, a.id, "(2L)DK1164+48000001"))).rejects.toThrow(/routing barcode/);
    await expect(tx((t) => linkBarcode(t, s.actor, a.id, "https://x.dk/b/BOX-0002"))).rejects.toThrow(/app label/);
  });

  it("resolves app QR labels from any host, unknown values, and discarded boxes", async () => {
    const a = await newBox();
    expect(await tx((t) => resolveScan(t, "https://old-railway.app/b/BOX-0001"))).toEqual({
      result: "box",
      code: "BOX-0001",
    });
    expect(await tx((t) => resolveScan(t, "JJD000000000000000001"))).toEqual({
      result: "unknown",
      value: "JD000000000000000001",
      kind: "dhl_piece",
    });
    await tx((t) => linkBarcode(t, s.actor, a.id, "ABC-123"));
    await tx((t) => deleteBox(t, s.actor, a.id));
    expect(await tx((t) => resolveScan(t, "BOX-0001"))).toMatchObject({ result: "message" });
    expect(await tx((t) => resolveScan(t, "abc-123"))).toMatchObject({
      result: "message",
      message: expect.stringContaining("discarded"),
    });
  });
});
