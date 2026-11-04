import { beforeEach, describe, expect, it } from "vitest";
import { eventPhase, formatDay, parseDay, todayIn } from "@/lib/days";
import type { Tx } from "@/server/db";
import {
  addBoxToEvent,
  arriveEventBoxes,
  createEvent,
  deleteEvent,
  eventFieldsSchema,
  packedForEvent,
  packForEvent,
  packSuggestions,
  removeBoxFromEvent,
  setPackingList,
  shipEventBoxes,
  updateEvent,
  wrapUpEvent,
} from "@/server/events";
import { addStock } from "@/server/stock";
import { createBox, packBox, shipBox, unpackBox } from "@/server/stock/boxes";
import { looseQty, makeItem, resetDb, seedBasics, testDb } from "./helpers/db";

let s: Awaited<ReturnType<typeof seedBasics>>;
const tx = <T>(fn: (t: Tx) => Promise<T>) => testDb.$transaction(fn, { timeout: 20_000 });

beforeEach(async () => {
  await resetDb();
  s = await seedBasics();
});

async function stocked(name: string, quantity: number, locationId = s.cph.id) {
  const item = await makeItem(name, s.nl.id);
  await tx((t) => addStock(t, s.actor, { itemId: item.id, quantity, place: { locationId } }));
  return item;
}

const fields = (over: Record<string, unknown> = {}) =>
  eventFieldsSchema.parse({ name: "Vitafoods 2026", venueId: s.venue.id, startDate: "2026-05-12", endDate: "2026-05-14", ...over });

async function makeEvent() {
  return tx((t) => createEvent(t, s.actor, fields()));
}

const boxQty = async (boxId: number, itemId: number) =>
  (await testDb.holding.findUnique({ where: { itemId_boxId: { itemId, boxId } } }))?.quantity ?? 0;

describe("calendar days", () => {
  it("parses real dates only, and formats them as DD/MM/YYYY", () => {
    expect(formatDay(parseDay("2026-11-04")!)).toBe("04/11/2026");
    expect(parseDay("2026-02-31")).toBeNull();
    expect(parseDay("04/11/2026")).toBeNull();
  });

  it("works out where an event is in its life", () => {
    const e = { startDate: parseDay("2026-05-12")!, endDate: parseDay("2026-05-14")!, wrappedUpAt: null };
    expect(eventPhase(e, "2026-05-11")).toBe("upcoming");
    expect(eventPhase(e, "2026-05-12")).toBe("on");
    expect(eventPhase(e, "2026-05-14")).toBe("on");
    expect(eventPhase(e, "2026-05-15")).toBe("ended");
    expect(eventPhase({ ...e, wrappedUpAt: new Date() }, "2026-05-13")).toBe("wrapped");
  });

  it("uses the app's time zone for today", () => {
    // 23:30 UTC on 4 Nov is already 5 Nov in Copenhagen.
    expect(todayIn("Europe/Copenhagen", new Date("2026-11-04T23:30:00Z"))).toBe("2026-11-05");
  });
});

describe("event details", () => {
  it("validates the form", () => {
    const r = eventFieldsSchema.safeParse({ name: " ", venueId: "", startDate: "2026-05-14", endDate: "2026-05-12" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "venueId"]));
    const order = eventFieldsSchema.safeParse({ name: "X", venueId: 1, startDate: "2026-05-14", endDate: "2026-05-12" });
    expect(order.error!.issues[0]).toMatchObject({ path: ["endDate"], message: "The end date can't be before the start date." });
  });

  it("creates, edits and deletes events with history; deleting keeps the boxes", async () => {
    const event = await makeEvent();
    expect(event.startDate.toISOString()).toBe("2026-05-12T00:00:00.000Z");
    await tx((t) => updateEvent(t, s.actor, event.id, fields({ name: "Vitafoods Europe 2026", endDate: "2026-05-15" })));
    const box = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
    await tx((t) => addBoxToEvent(t, s.actor, event.id, box.id));
    await tx((t) => deleteEvent(t, s.actor, event.id));
    expect((await testDb.box.findUniqueOrThrow({ where: { id: box.id } })).eventId).toBeNull();
    const log = await testDb.historyEntry.findMany({ where: { eventId: event.id }, orderBy: { id: "asc" } });
    expect(log.map((l) => l.summary)).toEqual([
      'Event "Vitafoods 2026" created at Vitafoods Barcelona (12/05/2026 – 14/05/2026)',
      'Event "Vitafoods 2026" renamed to "Vitafoods Europe 2026", dates changed to 12/05/2026 – 15/05/2026',
      'BOX-0001 added to event "Vitafoods Europe 2026"',
      'Event "Vitafoods Europe 2026" deleted (1 box kept, no longer linked)',
    ]);
  });
});

describe("packing list", () => {
  it("replaces the list and logs only what changed", async () => {
    const event = await makeEvent();
    const tote = await makeItem("Tote bag", s.nl.id);
    const banner = await makeItem("Banner", s.nl.id);
    await tx((t) => setPackingList(t, s.actor, event.id, [{ itemId: tote.id, quantity: 50 }, { itemId: banner.id, quantity: 2 }]));
    const r = await tx((t) => setPackingList(t, s.actor, event.id, [{ itemId: tote.id, quantity: 60 }, { itemId: banner.id, quantity: 0 }]));
    expect(r.changed).toBe(2);
    expect(await testDb.eventItem.findMany({ select: { itemId: true, quantity: true } })).toEqual([{ itemId: tote.id, quantity: 60 }]);
    const last = await testDb.historyEntry.findFirstOrThrow({ where: { eventId: event.id }, orderBy: { id: "desc" } });
    expect(last.summary).toBe('Packing list for "Vitafoods 2026": Tote bag 50 → 60; removed Banner');
    const again = await tx((t) => setPackingList(t, s.actor, event.id, [{ itemId: tote.id, quantity: 60 }]));
    expect(again.changed).toBe(0);
  });

  it("won't add archived items", async () => {
    const event = await makeEvent();
    const old = await makeItem("Old banner", s.nl.id);
    await testDb.item.update({ where: { id: old.id }, data: { archivedAt: new Date() } });
    await expect(tx((t) => setPackingList(t, s.actor, event.id, [{ itemId: old.id, quantity: 1 }]))).rejects.toThrow(/archived/);
  });

  it("suggests what's still needed, limited by what's available", () => {
    const list = [
      { itemId: 1, needed: 50 },
      { itemId: 2, needed: 2 },
      { itemId: 3, needed: 10 },
    ];
    const r = packSuggestions(list, new Map([[1, 20], [2, 5]]), new Map([[1, 100], [3, 4]]));
    expect(r.map((x) => [x.itemId, x.remaining, x.suggest])).toEqual([
      [1, 30, 30],
      [2, 0, 0],
      [3, 10, 4],
    ]);
  });
});

describe("pack for this event", () => {
  it("packs into a new box linked to the event, tagging the history", async () => {
    const event = await makeEvent();
    const tote = await stocked("Tote bag", 100);
    const r = await tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, lines: [{ itemId: tote.id, quantity: 30 }] }));
    const box = await testDb.box.findUniqueOrThrow({ where: { id: r.boxId } });
    expect(box).toMatchObject({ eventId: event.id, locationId: s.cph.id });
    expect(await boxQty(box.id, tote.id)).toBe(30);
    expect(await looseQty(tote.id, s.cph.id)).toBe(70);
    expect((await packedForEvent(testDb as unknown as Tx, event.id)).get(tote.id)).toBe(30);
    const actions = (await testDb.historyEntry.findMany({ where: { eventId: event.id }, orderBy: { id: "asc" } })).map((h) => h.action);
    expect(actions).toEqual(["EVENT_CREATED", "BOX_CREATED", "PACKED"]);
  });

  it("can pack more into an existing box at the same location", async () => {
    const event = await makeEvent();
    const tote = await stocked("Tote bag", 100);
    const box = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
    await tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, boxId: box.id, lines: [{ itemId: tote.id, quantity: 10 }] }));
    await tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, boxId: box.id, lines: [{ itemId: tote.id, quantity: 5 }] }));
    expect(await boxQty(box.id, tote.id)).toBe(15);
  });

  it("refuses more than is available, and boxes elsewhere or packed for another event", async () => {
    const event = await makeEvent();
    const other = await tx((t) => createEvent(t, s.actor, fields({ name: "Other show" })));
    const tote = await stocked("Tote bag", 5);
    await expect(
      tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, lines: [{ itemId: tote.id, quantity: 6 }] })),
    ).rejects.toThrow(/Only 5/);
    const venueBox = await tx((t) => createBox(t, s.actor, { locationId: s.venue.id }));
    await expect(
      tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, boxId: venueBox.id, lines: [{ itemId: tote.id, quantity: 1 }] })),
    ).rejects.toThrow(/isn't at that location/);
    const box = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
    await tx((t) => addBoxToEvent(t, s.actor, other.id, box.id));
    await expect(tx((t) => addBoxToEvent(t, s.actor, event.id, box.id))).rejects.toThrow(/packed for Other show/);
    await tx((t) => removeBoxFromEvent(t, s.actor, other.id, box.id));
    await tx((t) => addBoxToEvent(t, s.actor, event.id, box.id));
    expect((await testDb.box.findUniqueOrThrow({ where: { id: box.id } })).eventId).toBe(event.id);
    // nothing was half-done by the failed attempts
    expect(await looseQty(tote.id, s.cph.id)).toBe(5);
    expect(await testDb.box.count()).toBe(2);
  });
});

describe("ship all / arrive all", () => {
  it("ships only boxes not yet at or heading to the venue, then arrives those heading there", async () => {
    const event = await makeEvent();
    const tote = await stocked("Tote bag", 100);
    const pack = (n: number) =>
      tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, lines: [{ itemId: tote.id, quantity: n }] }));
    const a = await pack(10);
    const b = await pack(10);
    const c = await pack(10);
    const stray = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id })); // not part of the event
    // c is already on its way
    await tx((t) => shipBox(t, s.actor, { boxId: c.boxId, destinationId: s.venue.id }));

    const shipped = await tx((t) => shipEventBoxes(t, s.actor, event.id));
    expect(shipped.shipped).toEqual([a.code, b.code]);
    expect((await testDb.box.findUniqueOrThrow({ where: { id: stray.id } })).status).toBe("AT_LOCATION");
    await expect(tx((t) => shipEventBoxes(t, s.actor, event.id))).rejects.toThrow(/no boxes waiting/);

    const arrived = await tx((t) => arriveEventBoxes(t, s.actor, event.id));
    expect(arrived.arrived).toEqual([a.code, b.code, c.code]);
    const boxes = await testDb.box.findMany({ where: { eventId: event.id } });
    expect(boxes.every((x) => x.status === "AT_LOCATION" && x.locationId === s.venue.id)).toBe(true);
    // per-item history entries are tagged with the event
    expect(await testDb.historyEntry.count({ where: { eventId: event.id, action: "SHIPPED" } })).toBe(2);
    expect(await testDb.historyEntry.count({ where: { eventId: event.id, action: "ARRIVED" } })).toBe(3);
  });
});

describe("wrap-up", () => {
  async function atVenue() {
    const event = await makeEvent();
    const tote = await stocked("Tote bag", 100);
    const leaflet = await stocked("Leaflet", 500);
    const a = await tx((t) =>
      packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, lines: [{ itemId: tote.id, quantity: 50 }, { itemId: leaflet.id, quantity: 200 }] }),
    );
    const b = await tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, lines: [{ itemId: leaflet.id, quantity: 100 }] }));
    await tx((t) => shipEventBoxes(t, s.actor, event.id));
    await tx((t) => arriveEventBoxes(t, s.actor, event.id));
    return { event, tote, leaflet, a: a.boxId, b: b.boxId };
  }

  it("counts, packs loose leftovers back, ships, discards empty boxes, and closes the event", async () => {
    const { event, tote, leaflet, a, b } = await atVenue();
    // At the event, the tote bags were unpacked onto the stand.
    await tx((t) => unpackBox(t, s.actor, { boxId: a, lines: [{ itemId: tote.id, quantity: 50 }] }));

    const r = await tx((t) =>
      wrapUpEvent(t, s.actor, event.id, {
        reason: "USED_AT_EVENT",
        note: "Vitafoods",
        boxes: [
          { boxId: a, counts: [{ itemId: leaflet.id, actual: 120 }], then: { action: "ship", destinationId: s.cph.id } },
          { boxId: b, counts: [{ itemId: leaflet.id, actual: 0 }], then: { action: "discard" } },
        ],
        loose: [{ itemId: tote.id, actual: 38, packInto: a }],
      }),
    );
    expect(r).toEqual({ adjusted: 3, shipped: 1, discarded: 1, left: 0 });
    const boxA = await testDb.box.findUniqueOrThrow({ where: { id: a } });
    expect(boxA).toMatchObject({ status: "IN_TRANSIT", destinationId: s.cph.id, originId: s.venue.id });
    expect(await boxQty(a, leaflet.id)).toBe(120);
    expect(await boxQty(a, tote.id)).toBe(38);
    expect(await looseQty(tote.id, s.venue.id)).toBe(0);
    expect((await testDb.box.findUniqueOrThrow({ where: { id: b } })).deletedAt).not.toBeNull();
    const ev = await testDb.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(ev.wrappedUpAt).not.toBeNull();
    const last = await testDb.historyEntry.findFirstOrThrow({ where: { eventId: event.id }, orderBy: { id: "desc" } });
    expect(last.summary).toBe('Event "Vitafoods 2026" wrapped up: 3 counts updated, 1 box shipped, 1 empty box discarded');
    const counted = await testDb.historyEntry.findFirstOrThrow({ where: { eventId: event.id, action: "QUANTITY_ADJUSTED", itemId: tote.id } });
    expect(counted).toMatchObject({ quantityBefore: 50, quantityAfter: 38, reason: "Used at event", note: "Vitafoods" });
    // once wrapped up, stock actions on the event are refused
    await expect(tx((t) => shipEventBoxes(t, s.actor, event.id))).rejects.toThrow(/already been wrapped up/);
  });

  it("can leave boxes at the venue", async () => {
    const { event, leaflet, a, b } = await atVenue();
    const r = await tx((t) =>
      wrapUpEvent(t, s.actor, event.id, {
        reason: "USED_AT_EVENT",
        boxes: [
          { boxId: a, counts: [], then: { action: "leave" } },
          { boxId: b, counts: [{ itemId: leaflet.id, actual: 100 }], then: { action: "leave" } },
        ],
        loose: [],
      }),
    );
    expect(r).toEqual({ adjusted: 0, shipped: 0, discarded: 0, left: 2 });
    expect((await testDb.box.findUniqueOrThrow({ where: { id: a } })).locationId).toBe(s.venue.id);
  });

  it("saves nothing if part of it fails", async () => {
    const { event, leaflet, a, b } = await atVenue();
    await expect(
      tx((t) =>
        wrapUpEvent(t, s.actor, event.id, {
          reason: "USED_AT_EVENT",
          boxes: [
            { boxId: a, counts: [{ itemId: leaflet.id, actual: 10 }], then: { action: "ship", destinationId: s.cph.id } },
            { boxId: b, counts: [], then: { action: "discard" } }, // not empty
          ],
          loose: [],
        }),
      ),
    ).rejects.toThrow(/isn't empty/);
    expect(await boxQty(a, leaflet.id)).toBe(200);
    expect((await testDb.box.findUniqueOrThrow({ where: { id: a } })).status).toBe("AT_LOCATION");
    expect((await testDb.event.findUniqueOrThrow({ where: { id: event.id } })).wrappedUpAt).toBeNull();
  });

  it("refuses a plan that doesn't cover exactly the boxes at the venue", async () => {
    const { event, a } = await atVenue();
    await expect(
      tx((t) => wrapUpEvent(t, s.actor, event.id, { reason: "USED_AT_EVENT", boxes: [{ boxId: a, counts: [], then: { action: "leave" } }], loose: [] })),
    ).rejects.toThrow(/boxes have changed/);
  });
});

describe("history tagging", () => {
  it("only tags entries made through the event", async () => {
    const event = await makeEvent();
    const tote = await stocked("Tote bag", 10);
    const box = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
    await tx((t) => addBoxToEvent(t, s.actor, event.id, box.id));
    await tx((t) => packBox(t, s.actor, { boxId: box.id, lines: [{ itemId: tote.id, quantity: 1 }] })); // from the box page
    const packed = await testDb.historyEntry.findFirstOrThrow({ where: { action: "PACKED" } });
    expect(packed.eventId).toBeNull();
  });
});
