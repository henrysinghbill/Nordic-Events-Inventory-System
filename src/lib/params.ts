/** Parse a positive whole-number id from a route or search param; undefined if invalid. */
export function toId(value: string | string[] | undefined | null): number | undefined {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

export function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
