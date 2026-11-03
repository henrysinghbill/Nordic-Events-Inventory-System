/** Shared formatting helpers (safe to use on server and client). */

/** BOX-0047 style code from a box id. */
export function boxCode(id: number): string {
  return `BOX-${String(id).padStart(4, "0")}`;
}

const DEFAULT_TZ = "Europe/Copenhagen";

function parts(date: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { d: get("day"), m: get("month"), y: get("year"), h: get("hour"), min: get("minute") };
}

/** DD/MM/YYYY */
export function formatDate(date: Date, timeZone = DEFAULT_TZ): string {
  const { d, m, y } = parts(date, timeZone);
  return `${d}/${m}/${y}`;
}

/** DD/MM/YYYY HH:mm */
export function formatDateTime(date: Date, timeZone = DEFAULT_TZ): string {
  const { d, m, y, h, min } = parts(date, timeZone);
  return `${d}/${m}/${y} ${h}:${min}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
