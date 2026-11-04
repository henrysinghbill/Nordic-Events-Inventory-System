import { beforeEach, describe, expect, it } from "vitest";
import type { Db, Tx } from "@/server/db";
import { callsPerRun, checkDhlTracking, lastDhlRun, parseDhlResponse, type FetchFn } from "@/server/dhl";
import { arriveBox, createBox, linkBarcode, shipBox } from "@/server/stock/boxes";
import { resetDb, seedBasics, testDb } from "./helpers/db";

let s: Awaited<ReturnType<typeof seedBasics>>;
const tx = <T>(fn: (t: Tx) => Promise<T>) => testDb.$transaction(fn);
const db = testDb as unknown as Db;

beforeEach(async () => {
  await resetDb();
  s = await seedBasics();
});

const delivered = {
  shipments: [
    {
      id: "6456556024",
      service: "express",
      status: {
        timestamp: "2026-05-10T09:12:00Z",
        statusCode: "delivered",
        status: "DELIVERED",
        description: "Delivered - Signed for by: RECEPTION",
        location: { address: { addressLocality: "BARCELONA - SPAIN" } },
      },
    },
  ],
};
const inTransit = {
  shipments: [{ status: { statusCode: "transit", status: "TRANSIT", description: "Processed at LEIPZIG - GERMANY" } }],
};

/** A fake DHL that answers per waybill and records what was asked. */
function fakeDhl(answers: Record<string, { status: number; body?: unknown } | Error>) {
  const calls: string[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const waybill = new URL(url).searchParams.get("trackingNumber")!;
    calls.push(waybill);
    expect((init.headers as Record<string, string>)["DHL-API-Key"]).toBe("test-key");
    const a = answers[waybill];
    if (a instanceof Error) throw a;
    if (!a) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status });
  };
  return { fetchFn, calls };
}

async function boxInTransit(waybill?: string) {
  const box = await tx((t) => createBox(t, s.actor, { locationId: s.cph.id }));
  if (waybill) await tx((t) => linkBarcode(t, s.actor, box.id, waybill));
  await tx((t) => shipBox(t, s.actor, { boxId: box.id, destinationId: s.venue.id }));
  return box;
}

describe("parseDhlResponse", () => {
  it("reads delivered and in-transit statuses", () => {
    expect(parseDhlResponse(delivered)).toEqual({
      code: "delivered",
      text: "Delivered - Signed for by: RECEPTION – BARCELONA - SPAIN",
      delivered: true,
      at: new Date("2026-05-10T09:12:00Z"),
    });
    expect(parseDhlResponse(inTransit)).toMatchObject({ code: "transit", delivered: false, at: null });
    expect(parseDhlResponse({})).toBeNull();
    expect(parseDhlResponse(null)).toBeNull();
  });
});

describe("checkDhlTracking", () => {
  it("flags delivered boxes once, updates others, and shares one lookup per waybill", async () => {
    const a = await boxInTransit("6456556024");
    const b = await boxInTransit("6456556024"); // same shipment
    const c = await boxInTransit("1234567890");
    await boxInTransit(); // no waybill: not looked up
    const dhl = fakeDhl({ "6456556024": { status: 200, body: delivered }, "1234567890": { status: 200, body: inTransit } });

    const r = await checkDhlTracking(db, { apiKey: "test-key", maxCalls: 10, fetchFn: dhl.fetchFn });
    expect(r).toMatchObject({ checked: 2, delivered: 2, error: null });
    expect(dhl.calls.sort()).toEqual(["1234567890", "6456556024"]);
    const boxA = await testDb.box.findUniqueOrThrow({ where: { id: a.id } });
    expect(boxA.dhlDeliveredAt).toEqual(new Date("2026-05-10T09:12:00Z"));
    expect(boxA.status).toBe("IN_TRANSIT"); // flagged, not marked as arrived
    expect((await testDb.box.findUniqueOrThrow({ where: { id: c.id } })).dhlStatusText).toBe("Processed at LEIPZIG - GERMANY");
    expect(await testDb.historyEntry.count({ where: { action: "DHL_DELIVERED" } })).toBe(2);

    // A second run doesn't log "delivered" again.
    await checkDhlTracking(db, { apiKey: "test-key", maxCalls: 10, fetchFn: dhl.fetchFn });
    expect(await testDb.historyEntry.count({ where: { action: "DHL_DELIVERED", boxId: b.id } })).toBe(1);

    // Arriving clears the DHL flag.
    await tx((t) => arriveBox(t, s.actor, { boxId: a.id, locationId: s.venue.id }));
    expect((await testDb.box.findUniqueOrThrow({ where: { id: a.id } })).dhlDeliveredAt).toBeNull();
  });

  it("stays within the per-run limit, oldest checks first", async () => {
    const first = await boxInTransit("1111111111");
    await boxInTransit("2222222222");
    const dhl = fakeDhl({ "1111111111": { status: 200, body: inTransit }, "2222222222": { status: 200, body: inTransit } });
    await checkDhlTracking(db, { apiKey: "test-key", maxCalls: 1, fetchFn: dhl.fetchFn });
    await checkDhlTracking(db, { apiKey: "test-key", maxCalls: 1, fetchFn: dhl.fetchFn });
    expect(dhl.calls).toEqual(["1111111111", "2222222222"]);
    expect((await testDb.box.findUniqueOrThrow({ where: { id: first.id } })).dhlStatus).toBe("transit");
    expect(callsPerRun(60)).toBe(10);
    expect(callsPerRun(15)).toBe(2);
  });

  it("copes with no internet access and unknown waybills without throwing", async () => {
    await boxInTransit("1111111111");
    await boxInTransit("2222222222");
    const offline = fakeDhl({ "1111111111": new TypeError("fetch failed") });
    const r = await checkDhlTracking(db, { apiKey: "test-key", maxCalls: 10, fetchFn: offline.fetchFn });
    expect(r).toMatchObject({ checked: 0, error: "Couldn't connect to DHL (no internet access?)" });
    expect((await lastDhlRun(db))?.error).toMatch(/no internet/);

    const unknown = fakeDhl({});
    const r2 = await checkDhlTracking(db, { apiKey: "test-key", maxCalls: 10, fetchFn: unknown.fetchFn });
    expect(r2).toMatchObject({ checked: 2, delivered: 0, error: null });
    expect((await testDb.box.findFirstOrThrow()).dhlStatus).toBe("not-found");

    const badKey = fakeDhl({ "1111111111": { status: 401 }, "2222222222": { status: 401 } });
    expect((await checkDhlTracking(db, { apiKey: "test-key", maxCalls: 10, fetchFn: badKey.fetchFn })).error).toMatch(/API key/);
  });
});
