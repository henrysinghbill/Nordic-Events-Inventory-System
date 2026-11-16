import { beforeEach, describe, expect, it } from "vitest";
import { pathWithQuery, safeBackPath, withBack } from "@/lib/back";
import { matchesAll, searchTerms, stem, words } from "@/lib/search-text";
import { suggestType } from "@/lib/type-suggest";
import { whereSummary } from "@/lib/where";
import { backLink } from "@/server/back";
import type { Tx } from "@/server/db";
import { createEvent, eventFieldsSchema, packForEvent } from "@/server/events";
import { createItem } from "@/server/items";
import { boxesList, searchEvents, searchItems, searchLocations, suggestItems, typeUsage, untypedItems } from "@/server/queries";
import { addStock } from "@/server/stock";
import { createBox, linkBarcode, packBox, shipBox } from "@/server/stock/boxes";
import { findOrCreateType } from "@/server/types";
import { makeItem, resetDb, seedBasics, testDb } from "./helpers/db";

describe("matching typed text", () => {
  it("splits text into lower-case words of letters and digits", () => {
    expect(words("  Roll-up (85 cm), FuFu! ")).toEqual(["roll", "up", "85", "cm", "fufu"]);
    expect(words("Æble-tærte Øl")).toEqual(["æble", "tærte", "øl"]);
    expect(words(" - ")).toEqual([]);
  });

  it.each([
    ["banners", "banner"],
    ["Banner", "banner"],
    ["boxes", "box"],
    ["box", "box"],
    ["brushes", "brush"],
    ["glasses", "glass"],
    ["glass", "glass"],
    ["leaflets", "leaflet"],
    ["bus", "bus"],
    ["accessories", "accessor"],
    ["accessory", "accessor"],
    ["displays", "displa"],
    ["display", "displa"],
    ["a5", "a5"],
  ])("cuts %s down to %s", (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it("makes one search term per word, without repeats", () => {
    expect(searchTerms("Banners banner  FF")).toEqual([
      { word: "banners", stem: "banner" },
      { word: "ff", stem: "ff" },
    ]);
    expect(searchTerms("  ")).toEqual([]);
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8);
  });

  it("matchesAll needs every term, anywhere in the text", () => {
    expect(matchesAll("FuFu Roll-up Banner", searchTerms("banners fufu"))).toBe(true);
    expect(matchesAll("FuFu Roll-up Banner", searchTerms("banner leaflet"))).toBe(false);
    expect(matchesAll("anything", searchTerms(""))).toBe(true);
  });
});

describe("suggestType", () => {
  const types = [
    { id: 1, name: "Banner" },
    { id: 2, name: "Leaflet" },
    { id: 3, name: "Holder" },
    { id: 4, name: "Roll-up banner" },
    { id: 5, name: "Table cloth" },
  ];
  it.each([
    ["Functional Future banner 85x200", "Banner"],
    ["DNA Life LEAFLETS (A5)", "Leaflet"],
    ["FuFu roll-up banners", "Roll-up banner"], // the more specific type wins
    ["Leaflet holder", "Holder"], // the type mentioned last wins
    ["Holder for leaflets", "Leaflet"],
    ["Black table cloth 2 m", "Table cloth"],
    ["Cloth bag", null], // only part of "Table cloth"
    ["Tote bag", null],
    ["", null],
  ])("%s → %s", (name, expected) => {
    expect(suggestType(name, types)?.name ?? null).toBe(expected);
  });

  it("suggests nothing when there are no types", () => {
    expect(suggestType("Banner", [])).toBeNull();
  });
});

describe("whereSummary", () => {
  it("names the place when there is only one", () => {
    expect(whereSummary([])).toBeNull();
    expect(whereSummary([{ location: "Copenhagen storeroom" }])).toBe("Copenhagen storeroom");
    expect(whereSummary([{ box: { id: 12, location: "Copenhagen storeroom" } }])).toBe("BOX-0012 · Copenhagen storeroom");
    expect(whereSummary([{ box: { id: 7, location: null } }])).toBe("BOX-0007 · in transit");
  });

  it("counts the places when there are several", () => {
    const cph = "Copenhagen storeroom";
    expect(whereSummary([{ location: cph }, { box: { id: 1, location: cph } }, { box: { id: 2, location: cph } }])).toBe(
      "Copenhagen storeroom · 3 places",
    );
    expect(whereSummary([{ location: cph }, { box: { id: 1, location: null } }])).toBe("2 places");
    expect(whereSummary([{ box: { id: 1, location: null } }, { box: { id: 2, location: null } }])).toBe("In transit · 2 places");
  });
});

describe("back links", () => {
  it("only accepts paths inside the app", () => {
    expect(safeBackPath("/items?type=3&q=banner")).toBe("/items?type=3&q=banner");
    expect(safeBackPath("/")).toBe("/");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "items", "", "/a\nb", undefined, null, ["/items"]]) {
      expect(safeBackPath(bad)).toBeUndefined();
    }
    expect(safeBackPath(`/${"x".repeat(400)}`)).toBeUndefined();
  });

  it("adds ?back= to links and builds a page's own address", () => {
    expect(withBack("/items/5", undefined)).toBe("/items/5");
    expect(withBack("/items/5", "/items?type=3&q=roll up")).toBe("/items/5?back=%2Fitems%3Ftype%3D3%26q%3Droll%20up");
    expect(withBack("/boxes/new?location=2", "/locations/2")).toBe("/boxes/new?location=2&back=%2Flocations%2F2");
    // A link built this way is read back unchanged.
    const link = new URL(withBack("/items/5", "/boxes/BOX-0012?back=%2Fboxes"), "http://x");
    expect(safeBackPath(link.searchParams.get("back"))).toBe("/boxes/BOX-0012?back=%2Fboxes");
    // Something far too long is cut down to its path instead of growing for ever.
    expect(withBack("/items/5", `/items?q=${"x".repeat(500)}`)).toBe("/items/5?back=%2Fitems");
    expect(pathWithQuery("/items", { q: "", type: 3, company: undefined, archived: false, missingPhoto: "1" })).toBe(
      "/items?type=3&missingPhoto=1",
    );
    expect(pathWithQuery("/boxes", {})).toBe("/boxes");
  });
});

describe("searching the database", () => {
  let s: Awaited<ReturnType<typeof seedBasics>>;
  const tx = <T>(fn: (t: Tx) => Promise<T>) => testDb.$transaction(fn);
  const names = (list: { name: string }[]) => list.map((i) => i.name);

  /** A small, realistic catalogue. Returns the ids needed by the tests. */
  async function catalogue() {
    const type = async (name: string) => (await tx((t) => findOrCreateType(t, s.actor, name))).type.id;
    const [banner, leaflet] = [await type("Banner"), await type("Leaflet")];
    const item = (name: string, companyIds: number[], extra: { typeId?: number; description?: string; lowStockThreshold?: number } = {}) =>
      tx((t) => createItem(t, s.actor, { name, companyIds, ...extra }));
    const stock = (itemId: number, quantity: number, locationId = s.cph.id) =>
      tx((t) => addStock(t, s.actor, { itemId, quantity, place: { locationId } }));

    const rollup = await item("FuFu roll-up 85x200", [s.ff.id], { typeId: banner });
    const flag = await item("Beach flag", [s.nl.id], { typeId: banner, description: "Blue, with the old logo" });
    const flyer = await item("Gut health flyer A5", [s.nl.id, s.ff.id], { typeId: leaflet, lowStockThreshold: 100 });
    const tote = await item("Tote bag", [s.nl.id], { description: "Holds leaflets and samples" });
    const pens = await item("Pens", [s.ff.id]);
    const archived = await item("Old banner stand", [s.nl.id], { typeId: banner });
    await testDb.item.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    await stock(rollup.id, 2);
    await stock(flag.id, 1, s.venue.id);
    await stock(flyer.id, 60);
    await stock(tote.id, 40);
    // BOX-0001: 20 flyers and 10 totes, packed at Copenhagen. BOX-0002: empty. BOX-0003: the roll-ups, on their way to the venue.
    const box1 = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id, description: "Vitafoods give-aways" }));
    await tx((t) => packBox(t, s.actor, { boxId: box1.id, lines: [{ itemId: flyer.id, quantity: 20 }, { itemId: tote.id, quantity: 10 }] }));
    const box2 = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
    const box3 = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id, description: "Stand parts" }));
    await tx((t) => packBox(t, s.actor, { boxId: box3.id, lines: [{ itemId: rollup.id, quantity: 2 }] }));
    await tx((t) => linkBarcode(t, s.actor, box3.id, "JJD014600012901604680"));
    await tx((t) => linkBarcode(t, s.actor, box3.id, "WAYBILL 64 5655 6024"));
    await tx((t) => shipBox(t, s.actor, { boxId: box3.id, destinationId: s.venue.id }));
    return { banner, leaflet, rollup, flag, flyer, tote, pens, archived, box1, box2, box3 };
  }

  beforeEach(async () => {
    await resetDb();
    s = await seedBasics();
  });

  describe("searchItems", () => {
    it("lists everything active by name when nothing is typed", async () => {
      await catalogue();
      const { items, more } = await searchItems({}, testDb);
      expect(names(items)).toEqual(["Beach flag", "FuFu roll-up 85x200", "Gut health flyer A5", "Pens", "Tote bag"]);
      expect(more).toBe(false);
      expect(names((await searchItems({ includeArchived: true }, testDb)).items)).toContain("Old banner stand");
    });

    it("finds words in any order, ignoring capitals and plurals", async () => {
      await catalogue();
      const find = async (q: string) => names((await searchItems({ q }, testDb)).items);
      expect(await find("ROLL-UP fufu")).toEqual(["FuFu roll-up 85x200"]);
      expect(await find("bags")).toEqual(["Tote bag"]);
      expect(await find("flyers a5")).toEqual(["Gut health flyer A5"]);
      expect(await find("nothing-like-this")).toEqual([]);
    });

    it("also looks at the type, the company (name or initials) and the description", async () => {
      await catalogue();
      const find = async (q: string) => names((await searchItems({ q }, testDb)).items);
      // Type: neither name contains "banner".
      expect(await find("banners")).toEqual(["Beach flag", "FuFu roll-up 85x200"]);
      // Company by name and by initials.
      expect(await find("functional")).toEqual(["FuFu roll-up 85x200", "Gut health flyer A5", "Pens"]);
      expect(await find("FF")).toEqual(["FuFu roll-up 85x200", "Gut health flyer A5", "Pens"]);
      expect(await find("nl banner")).toEqual(["Beach flag"]);
      // Description.
      expect(await find("logo")).toEqual(["Beach flag"]);
    });

    it("puts name matches before matches found elsewhere", async () => {
      await catalogue();
      // "leaflet": the flyer through its type, the tote bag through its description; nothing by name.
      expect(names((await searchItems({ q: "leaflet" }, testDb)).items)).toEqual(["Gut health flyer A5", "Tote bag"]);
      await tx((t) => createItem(t, s.actor, { name: "Zebra leaflet", companyIds: [s.nl.id] }));
      expect(names((await searchItems({ q: "leaflet" }, testDb)).items)).toEqual(["Zebra leaflet", "Gut health flyer A5", "Tote bag"]);
    });

    it("filters by type, by no type, company and location", async () => {
      const c = await catalogue();
      const find = async (opts: Parameters<typeof searchItems>[0]) => names((await searchItems(opts, testDb)).items);
      expect(await find({ typeId: c.banner })).toEqual(["Beach flag", "FuFu roll-up 85x200"]);
      expect(await find({ typeId: c.banner, includeArchived: true })).toEqual(["Beach flag", "FuFu roll-up 85x200", "Old banner stand"]);
      expect(await find({ noType: true })).toEqual(["Pens", "Tote bag"]);
      expect(await find({ typeId: c.leaflet, companyId: s.ff.id })).toEqual(["Gut health flyer A5"]);
      expect(await find({ locationId: s.venue.id })).toEqual(["Beach flag"]);
      expect(await find({ q: "bag", typeId: c.banner })).toEqual([]);
    });

    it("filters by stock: in stock, out of stock and low stock", async () => {
      await catalogue();
      const find = async (stock: "in" | "out" | "low") => names((await searchItems({ stock }, testDb)).items);
      expect(await find("in")).toEqual(["Beach flag", "FuFu roll-up 85x200", "Gut health flyer A5", "Tote bag"]);
      expect(await find("out")).toEqual(["Pens"]);
      expect(await find("low")).toEqual(["Gut health flyer A5"]); // 60 in total, warning below 100
    });

    it("gives each item its type, total and where it is", async () => {
      await catalogue();
      const { items } = await searchItems({}, testDb);
      const card = (name: string) => {
        const { type, quantity, where } = items.find((i) => i.name === name)!;
        return { type, quantity, where };
      };
      expect(card("Beach flag")).toEqual({ type: "Banner", quantity: 1, where: "Vitafoods Barcelona" });
      expect(card("FuFu roll-up 85x200")).toEqual({ type: "Banner", quantity: 2, where: "BOX-0003 · in transit" });
      expect(card("Gut health flyer A5")).toEqual({ type: "Leaflet", quantity: 60, where: "Copenhagen storeroom · 2 places" });
      expect(card("Pens")).toEqual({ type: null, quantity: 0, where: null });
      // With a location chosen, only what is there counts.
      const here = (await searchItems({ locationId: s.cph.id }, testDb)).items;
      expect(names(here)).toEqual(["Gut health flyer A5", "Tote bag"]);
      expect(here[0]).toMatchObject({ quantity: 60, where: "Copenhagen storeroom · 2 places" });
    });

    it("says when there are more matches than it returns", async () => {
      await catalogue();
      const { items, more } = await searchItems({ take: 2 }, testDb);
      expect(names(items)).toEqual(["Beach flag", "FuFu roll-up 85x200"]);
      expect(more).toBe(true);
    });
  });

  describe("boxesList", () => {
    const codes = (boxes: { id: number }[]) => boxes.map((b) => b.id);

    it("lists every box that still exists, lowest number first, with its contents", async () => {
      const c = await catalogue();
      const all = await boxesList({}, testDb);
      expect(codes(all)).toEqual([c.box1.id, c.box2.id, c.box3.id]);
      expect(all[0].holdings.map((h) => [h.item.name, h.quantity])).toEqual([
        ["Gut health flyer A5", 20],
        ["Tote bag", 10],
      ]);
      expect(all[1].holdings).toEqual([]);
      expect(all[2]).toMatchObject({ status: "IN_TRANSIT", location: null, destination: { name: "Vitafoods Barcelona" } });
    });

    it("finds boxes by number, description, contents and barcode", async () => {
      const c = await catalogue();
      const find = async (q: string) => codes(await boxesList({ q }, testDb));
      expect(await find("BOX-0002")).toEqual([c.box2.id]);
      expect(await find("box 3")).toEqual([c.box3.id]);
      expect(await find("vitafoods")).toEqual([c.box1.id]); // description
      expect(await find("stand PARTS")).toEqual([c.box3.id]);
      expect(await find("tote bags")).toEqual([c.box1.id]); // something inside
      expect(await find("banner")).toEqual([c.box3.id]); // the type of something inside
      expect(await find("JD01 4600 0129 0160 4680")).toEqual([c.box3.id]); // DHL piece ID as printed
      expect(await find("6456556024")).toEqual([c.box3.id]); // waybill
      expect(await find("604680")).toEqual([c.box3.id]); // the end of the piece ID
      expect(await find("pens")).toEqual([]);
    });

    it("filters by place and by event", async () => {
      const c = await catalogue();
      expect(codes(await boxesList({ inTransit: true }, testDb))).toEqual([c.box3.id]);
      expect(codes(await boxesList({ locationId: s.cph.id }, testDb))).toEqual([c.box1.id, c.box2.id]);
      expect(codes(await boxesList({ locationId: s.venue.id }, testDb))).toEqual([]);
      expect(codes(await boxesList({ locationId: s.cph.id, q: "flyer" }, testDb))).toEqual([c.box1.id]);

      const event = await tx((t) =>
        createEvent(t, s.actor, eventFieldsSchema.parse({ name: "Vitafoods 2027", venueId: s.venue.id, startDate: "2027-05-11", endDate: "2027-05-13" })),
      );
      const { boxId } = await tx((t) =>
        packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, lines: [{ itemId: c.tote.id, quantity: 5 }] }),
      );
      const forEvent = await boxesList({ eventId: event.id }, testDb);
      expect(codes(forEvent)).toEqual([boxId]);
      expect(forEvent[0].event).toMatchObject({ name: "Vitafoods 2027", wrappedUpAt: null });
    });

    it("leaves out discarded boxes", async () => {
      const c = await catalogue();
      await testDb.box.update({ where: { id: c.box2.id }, data: { deletedAt: new Date() } });
      expect(codes(await boxesList({}, testDb))).toEqual([c.box1.id, c.box3.id]);
      expect(codes(await boxesList({ q: "BOX-0002" }, testDb))).toEqual([]);
    });
  });

  describe("backLink", () => {
    const fallback = { href: "/items", label: "Items" };

    it("names the page to go back to", async () => {
      const item = await makeItem("Tote bag", s.nl.id);
      const event = await tx((t) =>
        createEvent(t, s.actor, eventFieldsSchema.parse({ name: "Vitafoods 2027", venueId: s.venue.id, startDate: "2027-05-11", endDate: "2027-05-13" })),
      );
      const label = async (href: string) => {
        const link = await backLink(href, fallback);
        expect(link.href).toBe(href); // the address is kept exactly, filters and all
        return link.label;
      };
      expect(await label("/")).toBe("Home");
      expect(await label("/items?type=3&q=tote")).toBe("Items");
      expect(await label("/boxes?place=transit")).toBe("Boxes");
      expect(await label("/search?q=vitafoods")).toBe("Search results");
      expect(await label("/boxes/BOX-0012?back=%2Fboxes")).toBe("BOX-0012");
      expect(await label(`/locations/${s.cph.id}?company=2`)).toBe("Copenhagen storeroom");
      expect(await label(`/events/${event.id}`)).toBe("Vitafoods 2027");
      expect(await label(`/items/${item.id}`)).toBe("Tote bag");
    });

    it("uses the page's usual back link for anything else", async () => {
      for (const href of [undefined, "", "https://evil.example/items", "//evil.example", "/locations/9999", "/boxes/new", "/admin/users", "/items/12/edit"]) {
        expect(await backLink(href, fallback)).toEqual(fallback);
      }
    });
  });

  describe("pickers and filters", () => {
    it("suggests by name only while adding items, and more widely for packing lists", async () => {
      const c = await catalogue();
      // Adding an item: is there already one with these words in its name?
      expect(names(await suggestItems({ q: "bag tote" }, testDb))).toEqual(["Tote bag"]);
      expect(names(await suggestItems({ q: "banner" }, testDb))).toEqual([]); // archived items are never suggested
      expect(await suggestItems({ q: " " }, testDb)).toEqual([]);
      // Packing list: also by type or company, or a whole type.
      expect(names(await suggestItems({ q: "banner", wide: true }, testDb))).toEqual(["Beach flag", "FuFu roll-up 85x200"]);
      expect(names(await suggestItems({ typeId: c.leaflet, wide: true }, testDb))).toEqual(["Gut health flyer A5"]);
      expect(names(await suggestItems({ typeId: c.banner, q: "fufu", wide: true }, testDb))).toEqual(["FuFu roll-up 85x200"]);
      const [flyer] = await suggestItems({ q: "flyer" }, testDb);
      expect(flyer).toMatchObject({ type: "Leaflet", photoKey: null });
      expect(flyer.companyIds.sort()).toEqual([s.nl.id, s.ff.id].sort());
    });

    it("knows which types are in use and which items have none", async () => {
      const c = await catalogue();
      await tx((t) => findOrCreateType(t, s.actor, "Unused"));
      const usage = await typeUsage(false, testDb);
      expect(names(usage.all)).toEqual(["Banner", "Leaflet", "Unused"]);
      expect(names(usage.used)).toEqual(["Banner", "Leaflet"]);
      expect(usage.untyped).toBe(2);
      expect(names(await untypedItems(testDb))).toEqual(["Pens", "Tote bag"]);

      // A type that only an archived item has counts as used only when archived items are included.
      const stand = (await tx((t) => findOrCreateType(t, s.actor, "Stand"))).type;
      await testDb.item.update({ where: { id: c.archived.id }, data: { typeId: stand.id } });
      expect(names((await typeUsage(false, testDb)).used)).toEqual(["Banner", "Leaflet"]);
      expect(names((await typeUsage(true, testDb)).used)).toEqual(["Banner", "Leaflet", "Stand"]);
    });

    it("finds events and locations by name", async () => {
      await tx((t) =>
        createEvent(t, s.actor, eventFieldsSchema.parse({ name: "Vitafoods 2027", venueId: s.venue.id, startDate: "2027-05-11", endDate: "2027-05-13" })),
      );
      expect(names(await searchEvents("vitafoods", 8, testDb))).toEqual(["Vitafoods 2027"]);
      expect(names(await searchEvents("barcelona", 8, testDb))).toEqual(["Vitafoods 2027"]); // by venue
      expect(await searchEvents("", 8, testDb)).toEqual([]);
      expect(names(await searchLocations("copenhagen", 8, testDb))).toEqual(["Copenhagen storeroom"]);
      expect(names(await searchLocations("spain", 8, testDb))).toEqual(["Vitafoods Barcelona"]); // by country
      expect(await searchLocations("nowhere", 8, testDb)).toEqual([]);
    });
  });
});
