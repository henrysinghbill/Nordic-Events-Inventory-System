/**
 * ============================================================================
 *  BARCODE NORMALISATION — what a scanned or typed value means.
 * ============================================================================
 * Pure functions (no database), used by the scanner, manual entry and linking.
 *
 *  App QR label    {any host}/b/BOX-0047   → box 47   (host ignored, so labels printed
 *                  or typed "BOX-0047"/"box 47"          on one server keep working on another)
 *  DHL piece ID    printed "(J) JD01 4600 0129 0160 4680", encoded "JJD014600012901604680"
 *                  → "JD014600012901604680" (unique to one box)
 *  DHL waybill     printed "WAYBILL 64 5655 6024" → "6456556024" (10 digits, shared by a shipment)
 *  DHL routing     "(2L)DK1164+48000001" → rejected with a helpful message
 *  Anything else   uppercased, spaces/brackets removed → can be linked to a box as "other"
 */

export type ScanMeaning =
  | { kind: "box"; boxId: number }
  | { kind: "dhl_piece"; value: string }
  | { kind: "dhl_waybill"; value: string }
  | { kind: "dhl_routing" }
  | { kind: "other"; value: string }
  | { kind: "empty" };

export const ROUTING_MESSAGE =
  "That's DHL's routing barcode. Scan the bottom barcode (starting JD) instead.";

/** Uppercase; remove whitespace, brackets and invisible control characters (e.g. GS1 separators). */
export function cleanBarcode(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f\s()[\]{}]/g, "").toUpperCase();
}

/** Normalise a DHL piece ID: "(J) JD01 4600…" and "JJD014600…" both become "JD014600…". */
export function normaliseDhlPiece(raw: string): string {
  const v = cleanBarcode(raw);
  return v.startsWith("JJD") ? v.slice(1) : v;
}

const BOX_URL = /\/B\/(?:BOX-?)?(\d{1,9})\/?(?:[?#].*)?$/i;
const BOX_CODE = /^BOX[-\s]*0*(\d{1,9})$/i;

export function interpretScan(raw: string): ScanMeaning {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };

  // App QR label: a URL ending in /b/BOX-0047 (any host).
  if (/^https?:\/\//i.test(trimmed)) {
    const m = BOX_URL.exec(trimmed);
    if (m) return boxResult(m[1]);
  }
  // Typed box code: "BOX-0047", "box 47", "BOX47".
  const typed = BOX_CODE.exec(trimmed);
  if (typed) return boxResult(typed[1]);

  const v = cleanBarcode(trimmed);
  if (v.startsWith("2L")) return { kind: "dhl_routing" };

  const piece = normaliseDhlPiece(v);
  if (/^JD\d{10,24}$/.test(piece)) return { kind: "dhl_piece", value: piece };

  const waybill = v.replace(/^WAYBILL/, "").replace(/[-.]/g, "");
  if (/^\d{10}$/.test(waybill)) return { kind: "dhl_waybill", value: waybill };

  return { kind: "other", value: v };
}

const RANK: Record<ScanMeaning["kind"], number> = {
  box: 0,
  dhl_piece: 1,
  dhl_waybill: 2,
  other: 3,
  dhl_routing: 4,
  empty: 5,
};

/**
 * A camera frame often contains several barcodes (a DHL label has three).
 * Order them by usefulness — box label / piece ID first, routing barcode last —
 * and drop duplicates and blanks.
 */
export function rankScans(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .filter((v) => v.trim())
    .map((v) => ({ v, m: interpretScan(v) }))
    .filter(({ m }) => {
      const key = JSON.stringify(m);
      if (seen.has(key) || m.kind === "empty") return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => RANK[a.m.kind] - RANK[b.m.kind])
    .map(({ v }) => v);
}

function boxResult(digits: string): ScanMeaning {
  const boxId = Number(digits);
  return boxId > 0 ? { kind: "box", boxId } : { kind: "empty" };
}

/** Parse a box code from a URL segment ("BOX-0047" or "47"). */
export function parseBoxCode(code: string): number | undefined {
  const m = /^(?:BOX-?)?0*(\d{1,9})$/i.exec(code.trim());
  const id = m ? Number(m[1]) : NaN;
  return id > 0 ? id : undefined;
}

/** Fill the DHL tracking link template with a waybill number. */
export function trackingUrl(template: string, waybill: string): string {
  return template.replaceAll("{waybill}", encodeURIComponent(waybill));
}
