/**
 * Calendar days (event start/end dates) without a time of day.
 * They are stored as midnight UTC, so they are always read and written in UTC
 * here — otherwise a time zone could shift them by a day.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-04" → Date at 00:00 UTC, or null if it isn't a real date. */
export function parseDay(value: string): Date | null {
  const m = DAY.exec(value.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return dayString(date) === value.trim() ? date : null;
}

/** Date → "2026-11-04" (for <input type="date"> and comparisons). */
export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Date → "04/11/2026". */
export function formatDay(date: Date): string {
  const [y, m, d] = dayString(date).split("-");
  return `${d}/${m}/${y}`;
}

/** "04/11/2026 – 06/11/2026", or a single date for a one-day event. */
export function formatDayRange(start: Date, end: Date): string {
  return dayString(start) === dayString(end) ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

/** Today's date ("2026-11-04") in the given time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type EventPhase = "upcoming" | "on" | "ended" | "wrapped";

export function eventPhase(event: { startDate: Date; endDate: Date; wrappedUpAt: Date | null }, today: string): EventPhase {
  if (event.wrappedUpAt) return "wrapped";
  if (today < dayString(event.startDate)) return "upcoming";
  if (today <= dayString(event.endDate)) return "on";
  return "ended";
}

export const PHASE_LABEL: Record<EventPhase, string> = {
  upcoming: "Upcoming",
  on: "On now",
  ended: "Ended – needs wrap-up",
  wrapped: "Wrapped up",
};

export const PHASE_TONE: Record<EventPhase, "brand" | "green" | "amber" | "gray"> = {
  upcoming: "brand",
  on: "green",
  ended: "amber",
  wrapped: "gray",
};
