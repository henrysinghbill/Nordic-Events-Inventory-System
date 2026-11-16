import { stem, words } from "./search-text";

export type TypeOption = { id: number; name: string };

/**
 * Guess an item's type from its name. A type fits when every word of the
 * type's name appears in the item's name, ignoring capitals and plurals:
 * "FuFu roll-up banners" → Banner.
 *
 * If several types fit, the one mentioned last wins, because the main noun
 * usually comes last ("Leaflet holder" is a holder, not a leaflet). On a tie
 * the longer type name wins ("Roll-up banner" beats "Banner").
 *
 * It is only ever a suggestion: the person can always pick something else.
 */
export function suggestType<T extends TypeOption>(itemName: string, types: readonly T[]): T | null {
  const nameStems = words(itemName).map(stem);
  if (nameStems.length === 0) return null;
  let best: { type: T; position: number; size: number } | null = null;
  for (const type of types) {
    const typeStems = words(type.name).map(stem);
    if (typeStems.length === 0) continue;
    const positions = typeStems.map((s) => nameStems.lastIndexOf(s));
    if (positions.some((p) => p < 0)) continue;
    const position = Math.max(...positions);
    const size = typeStems.length;
    if (!best || position > best.position || (position === best.position && size > best.size)) {
      best = { type, position, size };
    }
  }
  return best?.type ?? null;
}
