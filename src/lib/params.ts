/** Parse a positive whole-number id from a route or search param; undefined if invalid. */
export function toId(value: string | string[] | undefined | null): number | undefined {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

export function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** A list of ids from ?boxes=1,2,3 or ?boxes=1&boxes=2 (invalid ones dropped, no duplicates). */
export function idList(v: string | string[] | undefined): number[] {
  const parts = (Array.isArray(v) ? v : [v ?? ""]).flatMap((s) => s.split(","));
  return [...new Set(parts.map((p) => toId(p.trim())).filter((n): n is number => Boolean(n)))];
}
