import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db, Tx } from "@/server/db";
import { createEvent, eventFieldsSchema, packForEvent } from "@/server/events";
import { inventoryWorkbook } from "@/server/export";
import { addStock } from "@/server/stock";
import { shipBox } from "@/server/stock/boxes";
import { findOrCreateType } from "@/server/types";
import { buildXlsx } from "@/server/xlsx";
import { makeItem, resetDb, seedBasics, testDb } from "./helpers/db";

/** Read a zip back (only what our writer produces: deflated entries). */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const localNameLen = buf.readUInt16LE(offset + 26);
    const start = offset + 30 + localNameLen;
    out.set(name, inflateRawSync(buf.subarray(start, start + size)).toString("utf8"));
    p += 46 + nameLen;
  }
  return out;
}

describe("buildXlsx", () => {
  it("writes a valid workbook with escaped text, numbers and safe sheet names", () => {
    const file = buildXlsx([
      { name: "Stock: A/B", header: ["Name", "Qty"], rows: [["Tote <bag> & \"co\"", 5], ["=SUM(A1)", null], ["bad\u0001char", 0]] },
      { name: "Stock: A/B", header: ["X"], rows: [] },
    ]);
    expect(file.subarray(0, 2).toString()).toBe("PK");
    const files = unzip(file);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/styles.xml"]),
    );
    const wb = files.get("xl/workbook.xml")!;
    expect(wb).toContain('name="Stock  A B"');
    expect(wb).toContain('name="Stock  A B 2"');
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Tote &lt;bag&gt; &amp; &quot;co&quot;");
    expect(sheet).toContain('<c r="B2"><v>5</v></c>');
    // Text that looks like a formula stays text.
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t>=SUM(A1)</t></is></c>');
    expect(sheet).toContain("<t>badchar</t>");
    expect(sheet).toContain('<autoFilter ref="A1:B4"/>');
  });
});

describe("inventory export", () => {
  let s: Awaited<ReturnType<typeof seedBasics>>;
  const tx = <T>(fn: (t: Tx) => Promise<T>) => testDb.$transaction(fn);
  beforeEach(async () => {
    await resetDb();
    s = await seedBasics();
  });

  it("lists every place things are, items with totals, boxes and events", async () => {
    const tote = await makeItem("Tote bag", s.nl.id);
    const { type } = await tx((t) => findOrCreateType(t, s.actor, "Giveaway"));
    await testDb.item.update({ where: { id: tote.id }, data: { lowStockThreshold: 100, typeId: type.id } });
    await tx((t) => addStock(t, s.actor, { itemId: tote.id, quantity: 60, place: { locationId: s.cph.id } }));
    const event = await tx((t) =>
      createEvent(t, s.actor, eventFieldsSchema.parse({ name: "Vitafoods 2026", venueId: s.venue.id, startDate: "2026-05-12", endDate: "2026-05-14" })),
    );
    const { boxId } = await tx((t) => packForEvent(t, s.actor, { eventId: event.id, locationId: s.cph.id, lines: [{ itemId: tote.id, quantity: 20 }] }));
    await tx((t) => shipBox(t, s.actor, { boxId, destinationId: s.venue.id }));

    const file = await inventoryWorkbook(testDb as unknown as Db, "Europe/Copenhagen");
    const files = unzip(file);
    expect(files.get("xl/workbook.xml")).toContain('name="Where things are"');
    const where = files.get("xl/worksheets/sheet1.xml")!;
    expect(where).toContain("<t>(loose)</t>");
    expect(where).toContain("<t>In transit: Copenhagen storeroom → Vitafoods Barcelona</t>");
    expect(where).toContain("<t>Vitafoods 2026</t>");
    expect(where).toContain('<c r="B1" s="1" t="inlineStr"><is><t>Type</t></is></c>');
    expect(where).toContain('<c r="B2" t="inlineStr"><is><t>Giveaway</t></is></c>');
    const items = files.get("xl/worksheets/sheet2.xml")!;
    expect(items).toContain('<c r="B2" t="inlineStr"><is><t>Giveaway</t></is></c>');
    expect(items).toContain('<c r="D2"><v>60</v></c>'); // 40 loose + 20 in the box
    expect(items).toContain('<c r="F2" t="inlineStr"><is><t>Yes</t></is></c>'); // below 100
    const boxes = files.get("xl/worksheets/sheet3.xml")!;
    expect(boxes).toContain("<t>20 × Tote bag</t>");
    const events = files.get("xl/worksheets/sheet4.xml")!;
    expect(events).toContain("<t>12/05/2026</t>");

    // Leave a copy for opening in a real spreadsheet program when checking by hand.
    if (process.env.EXPORT_SAMPLE) fs.writeFileSync(process.env.EXPORT_SAMPLE, file);
  });
});
