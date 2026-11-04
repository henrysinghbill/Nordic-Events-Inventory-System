/**
 * Optional DHL tracking automation.
 *
 * Only runs when DHL_API_KEY is set. Every DHL_CHECK_MINUTES it asks DHL's
 * Shipment Tracking API about the newest waybill of each box in transit. When
 * DHL reports a shipment as delivered, the box is flagged ("DHL says
 * delivered") so someone can confirm it with "Mark as arrived". It never marks
 * boxes as arrived by itself: a parcel signed for at a venue's reception isn't
 * necessarily where our team can find it.
 *
 * If the server has no internet access, the check fails quietly (logged, and
 * shown on the home page); everything else keeps working.
 *
 * API: https://developer.dhl.com/api-reference/shipment-tracking
 *   GET https://api-eu.dhl.com/track/shipments?trackingNumber=…&service=express
 *   Header: DHL-API-Key: <key>
 * The free tier allows 250 calls a day and one call every 5 seconds, so calls
 * are spaced out and capped per run (see callsPerRun).
 */
import { boxCode } from "@/lib/format";
import type { Db } from "./db";

export const DHL_API_URL = "https://api-eu.dhl.com/track/shipments";
const DAILY_CALL_BUDGET = 240; // a little under DHL's 250/day
const SETTING_KEY = "dhl.lastRun";

export type DhlStatus = { code: string; text: string; delivered: boolean; at: Date | null };

/** Pull the current status out of DHL's JSON response. Returns null if there is none. */
export function parseDhlResponse(json: unknown): DhlStatus | null {
  const shipment = (json as { shipments?: unknown[] })?.shipments?.[0] as
    | { status?: { statusCode?: string; status?: string; description?: string; timestamp?: string; location?: { address?: { addressLocality?: string } } } }
    | undefined;
  const status = shipment?.status;
  if (!status) return null;
  const code = String(status.statusCode ?? status.status ?? "unknown").toLowerCase();
  const place = status.location?.address?.addressLocality;
  const text = [status.description || status.status || code, place].filter(Boolean).join(" – ").slice(0, 300);
  const at = status.timestamp ? new Date(status.timestamp) : null;
  return {
    code,
    text,
    delivered: code === "delivered",
    at: at && !Number.isNaN(at.getTime()) ? at : null,
  };
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class DhlRateLimited extends Error {}

/** Ask DHL about one waybill. Returns null when DHL doesn't know the number (yet). */
export async function fetchDhlStatus(waybill: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<DhlStatus | null> {
  const url = `${DHL_API_URL}?trackingNumber=${encodeURIComponent(waybill)}&service=express`;
  const res = await fetchFn(url, {
    headers: { "DHL-API-Key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return null;
  if (res.status === 429) throw new DhlRateLimited("DHL rate limit reached");
  if (res.status === 401 || res.status === 403) throw new Error(`DHL rejected the API key (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`DHL answered HTTP ${res.status}`);
  return parseDhlResponse(await res.json());
}

/** How many waybills one run may look up, so a day's runs stay under DHL's limit. */
export function callsPerRun(intervalMinutes: number): number {
  const runsPerDay = Math.max(1, Math.floor((24 * 60) / Math.max(1, intervalMinutes)));
  return Math.max(1, Math.floor(DAILY_CALL_BUDGET / runsPerDay));
}

export type DhlRunResult = { at: string; checked: number; delivered: number; error: string | null };

/**
 * One round of checks. Looks up the boxes checked longest ago first, one
 * waybill at a time (boxes sharing a waybill are updated together).
 */
export async function checkDhlTracking(
  db: Db,
  opts: { apiKey: string; maxCalls: number; fetchFn?: FetchFn; pauseMs?: number; now?: () => Date },
): Promise<DhlRunResult> {
  const now = opts.now ?? (() => new Date());
  const boxes = await db.box.findMany({
    where: { status: "IN_TRANSIT", deletedAt: null, barcodes: { some: { type: "DHL_WAYBILL" } } },
    select: {
      id: true,
      dhlCheckedAt: true,
      dhlDeliveredAt: true,
      destination: { select: { name: true } },
      barcodes: { where: { type: "DHL_WAYBILL" }, orderBy: { id: "desc" }, take: 1, select: { value: true } },
    },
    orderBy: [{ dhlCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
  });

  // Group by waybill, keeping the "checked longest ago" order.
  const byWaybill = new Map<string, typeof boxes>();
  for (const box of boxes) {
    const waybill = box.barcodes[0].value;
    byWaybill.set(waybill, [...(byWaybill.get(waybill) ?? []), box]);
  }

  let checked = 0;
  let delivered = 0;
  let error: string | null = null;
  for (const [waybill, group] of [...byWaybill].slice(0, opts.maxCalls)) {
    if (checked > 0 && opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs));
    let status: DhlStatus | null;
    try {
      status = await fetchDhlStatus(waybill, opts.apiKey, opts.fetchFn);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === "TimeoutError") error = "DHL didn't answer in time";
      if (err instanceof TypeError) error = "Couldn't connect to DHL (no internet access?)";
      break; // stop this round; try again next time
    }
    checked++;
    const checkedAt = now();
    for (const box of group) {
      const newlyDelivered = Boolean(status?.delivered && !box.dhlDeliveredAt);
      await db.$transaction(async (tx) => {
        // updateMany: skip quietly if the box was marked as arrived in the meantime.
        const updated = await tx.box.updateMany({
          where: { id: box.id, status: "IN_TRANSIT" },
          data: {
            dhlCheckedAt: checkedAt,
            dhlStatus: status?.code ?? "not-found",
            dhlStatusText: status?.text ?? "DHL doesn't know this waybill yet",
            ...(newlyDelivered ? { dhlDeliveredAt: status!.at ?? checkedAt } : {}),
          },
        });
        if (newlyDelivered && updated.count === 1) {
          await tx.historyEntry.create({
            data: {
              userName: "DHL tracking",
              action: "DHL_DELIVERED",
              summary: `DHL reports ${boxCode(box.id)} (waybill ${waybill}) as delivered. Waiting for someone to mark it as arrived at ${box.destination?.name ?? "its destination"}.`,
              boxId: box.id,
            },
          });
        }
      });
      if (newlyDelivered) delivered++;
    }
  }

  const result: DhlRunResult = { at: now().toISOString(), checked, delivered, error };
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });
  return result;
}

/** The outcome of the most recent run, for the home page. */
export async function lastDhlRun(db: Db): Promise<DhlRunResult | null> {
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as DhlRunResult;
  } catch {
    return null;
  }
}

let started = false;

/** Start the background checks (called once at server start when DHL_API_KEY is set). */
export function startDhlTracking(db: Db, apiKey: string, intervalMinutes: number) {
  if (started) return;
  started = true;
  const maxCalls = callsPerRun(intervalMinutes);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await checkDhlTracking(db, { apiKey, maxCalls, pauseMs: 5_500 });
      if (r.error) console.warn(`[dhl] Tracking check stopped: ${r.error}`);
      else if (r.checked) console.log(`[dhl] Checked ${r.checked} waybill(s); ${r.delivered} newly delivered.`);
    } catch (err) {
      console.error("[dhl] Tracking check failed:", err);
    } finally {
      running = false;
    }
  };
  console.log(`[dhl] Tracking automation on: every ${intervalMinutes} min, up to ${maxCalls} waybill(s) per check.`);
  setTimeout(run, 60_000).unref();
  setInterval(run, intervalMinutes * 60_000).unref();
}
