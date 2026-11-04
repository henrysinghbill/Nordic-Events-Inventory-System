import { describe, expect, it } from "vitest";
import { interpretScan, normaliseDhlPiece, parseBoxCode, rankScans, trackingUrl } from "@/lib/barcodes";

describe("DHL piece ID normalisation", () => {
  it("makes the printed and the scanned form identical", () => {
    const printed = normaliseDhlPiece("(J) JD01 4600 0129 0160 4680");
    const scanned = normaliseDhlPiece("JJD014600012901604680");
    expect(printed).toBe("JD014600012901604680");
    expect(scanned).toBe(printed);
  });

  it("handles lower case and stray whitespace", () => {
    expect(normaliseDhlPiece("  jjd01 4600 0129 0160 4680\n")).toBe("JD014600012901604680");
  });

  it("only strips the J identifier when the value starts with JJD", () => {
    expect(normaliseDhlPiece("JD014600012901604680")).toBe("JD014600012901604680");
    expect(normaliseDhlPiece("JVGL06123456789")).toBe("JVGL06123456789");
  });
});

describe("interpretScan", () => {
  it.each([
    ["https://inventory.nordic.dk/b/BOX-0047", 47],
    ["https://some-app.up.railway.app/b/BOX-0047", 47],
    ["http://localhost:3000/b/BOX-0047?utm=x", 47],
    ["https://random-words.trycloudflare.com/b/box-12/", 12],
    ["BOX-0047", 47],
    ["box 47", 47],
    ["BOX47", 47],
  ])("reads %s as box %i", (raw, boxId) => {
    expect(interpretScan(raw)).toEqual({ kind: "box", boxId });
  });

  it("reads DHL piece IDs in every form", () => {
    for (const raw of ["JJD014600012901604680", "(J) JD01 4600 0129 0160 4680", "JD014600012901604680"]) {
      expect(interpretScan(raw)).toEqual({ kind: "dhl_piece", value: "JD014600012901604680" });
    }
  });

  it("ignores control characters a scanner may add", () => {
    expect(interpretScan("\u001dJJD014600012901604680")).toEqual({
      kind: "dhl_piece",
      value: "JD014600012901604680",
    });
  });

  it("reads waybills scanned or typed", () => {
    for (const raw of ["6456556024", "64 5655 6024", "WAYBILL 64 5655 6024", "waybill 64-5655-6024"]) {
      expect(interpretScan(raw)).toEqual({ kind: "dhl_waybill", value: "6456556024" });
    }
  });

  it("rejects the DHL routing barcode", () => {
    expect(interpretScan("(2L)DK1164+48000001")).toEqual({ kind: "dhl_routing" });
    expect(interpretScan("2LDK1164+48000001")).toEqual({ kind: "dhl_routing" });
  });

  it("treats anything else as an 'other' barcode, normalised", () => {
    expect(interpretScan(" abc 123 ")).toEqual({ kind: "other", value: "ABC123" });
    expect(interpretScan("https://example.com/some/page")).toEqual({
      kind: "other",
      value: "HTTPS://EXAMPLE.COM/SOME/PAGE",
    });
  });

  it("does not mistake 9 or 11 digits for a waybill", () => {
    expect(interpretScan("123456789").kind).toBe("other");
    expect(interpretScan("12345678901").kind).toBe("other");
  });

  it("returns empty for blank input and box 0", () => {
    expect(interpretScan("   ")).toEqual({ kind: "empty" });
    expect(interpretScan("BOX-0000")).toEqual({ kind: "empty" });
  });
});

describe("rankScans (several barcodes in one camera frame)", () => {
  it("puts the piece ID first and the routing barcode last", () => {
    expect(rankScans(["2LDK1164+48000001", "6456556024", "JJD014600012901604680"])).toEqual([
      "JJD014600012901604680",
      "6456556024",
      "2LDK1164+48000001",
    ]);
  });

  it("puts an app box label first and drops duplicates and blanks", () => {
    expect(rankScans(["JJD014600012901604680", "", "https://x/b/BOX-0001", "JD014600012901604680"])).toEqual([
      "https://x/b/BOX-0001",
      "JJD014600012901604680",
    ]);
  });
});

describe("parseBoxCode / trackingUrl", () => {
  it("parses box codes from URLs", () => {
    expect(parseBoxCode("BOX-0047")).toBe(47);
    expect(parseBoxCode("47")).toBe(47);
    expect(parseBoxCode("box-47")).toBe(47);
    expect(parseBoxCode("BOX-0")).toBeUndefined();
    expect(parseBoxCode("hello")).toBeUndefined();
  });

  it("builds DHL tracking links", () => {
    expect(
      trackingUrl("https://www.dhl.com/x?submit=1&tracking-id={waybill}", "6456556024"),
    ).toBe("https://www.dhl.com/x?submit=1&tracking-id=6456556024");
  });
});
