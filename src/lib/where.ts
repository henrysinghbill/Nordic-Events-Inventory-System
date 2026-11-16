import { boxCode } from "./format";

/** One place an item is: loose at a location, or in a box (which is at a location or in transit). */
export type ItemPlace = {
  /** Name of the location when the stock is loose there. */
  location?: string | null;
  box?: {
    id: number;
    /** Name of the location the box is at; null while it is in transit. */
    location: string | null;
  } | null;
};

/**
 * Where an item is, in a few words for a card:
 *   one place     → "Copenhagen storeroom", "BOX-0012 · Copenhagen storeroom" or "BOX-0012 · in transit"
 *   one location  → "Copenhagen storeroom · 3 places"
 *   spread out    → "3 places"
 *   nowhere       → null
 */
export function whereSummary(places: ItemPlace[]): string | null {
  if (places.length === 0) return null;
  if (places.length === 1) {
    const [p] = places;
    if (p.box) return `${boxCode(p.box.id)} · ${p.box.location ?? "in transit"}`;
    return p.location ?? null;
  }
  const locations = new Set(places.map((p) => (p.box ? (p.box.location ?? "In transit") : (p.location ?? ""))));
  const count = `${places.length} places`;
  return locations.size === 1 ? `${[...locations][0]} · ${count}` : count;
}
