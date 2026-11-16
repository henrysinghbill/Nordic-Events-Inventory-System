/**
 * How typed text is matched against names. Shared by the item search, the box
 * search and the "suggest a type from the name" helper (safe on server and client).
 */

/** The words of a text in lower case, letters and digits only: "Roll-up (85 cm)" → roll, up, 85, cm. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Cut a word down so that singular and plural match:
 * "banners" → "banner", "boxes" → "box", "accessories" and "accessory" → "accessor".
 * Deliberately simple: it only has to make typed text find names, not be good English.
 */
export function stem(word: string): string {
  let s = word.toLowerCase();
  if (s.length > 4 && s.endsWith("ies")) return s.slice(0, -3);
  if (s.length > 4 && /(s|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("y")) s = s.slice(0, -1);
  return s;
}

export type SearchTerm = {
  /** The word as typed (lower case). */
  word: string;
  /** The word cut down with stem(); look for this inside names. */
  stem: string;
};

const MAX_TERMS = 8;

/** What to look for when someone searches: one term per word, no repeats. */
export function searchTerms(query: string): SearchTerm[] {
  const seen = new Set<string>();
  const out: SearchTerm[] = [];
  for (const word of words(query)) {
    const s = stem(word);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push({ word, stem: s });
    if (out.length === MAX_TERMS) break;
  }
  return out;
}

/** True when every search term appears somewhere in the text (for filtering lists in the browser). */
export function matchesAll(text: string, terms: SearchTerm[]): boolean {
  const haystack = text.toLowerCase();
  return terms.every((t) => haystack.includes(t.stem));
}
