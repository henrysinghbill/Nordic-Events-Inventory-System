/**
 * "← Back" links that return to where you actually came from.
 *
 * An item or a box can be opened from many places (the Items list, a box, a
 * location, an event…). Lists add ?back=/where/you/are to their links with
 * withBack(), and the page turns it into its back link (see src/server/back.ts).
 */

const MAX_LENGTH = 400;

/**
 * Accept only paths inside this app ("/items?type=3"), so a crafted link can
 * never send someone to another website.
 */
export function safeBackPath(value: string | string[] | undefined | null): string | undefined {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value;
}

/** Add ?back=… to a link. A very long value is cut down to its path, so links can't grow without end. */
export function withBack(href: string, back: string | undefined | null): string {
  if (!back) return href;
  const value = back.length > MAX_LENGTH ? back.split("?")[0] : back;
  return `${href}${href.includes("?") ? "&" : "?"}back=${encodeURIComponent(value)}`;
}

/** A page's own address with its search parameters, for use as the `back` of the links on it. */
export function pathWithQuery(path: string, params: Record<string, string | number | undefined | null | false>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== false && value !== "") query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
