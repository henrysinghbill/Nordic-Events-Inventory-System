import "server-only";
import { safeBackPath } from "@/lib/back";
import { parseBoxCode } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { db } from "./db";

export type BackLink = { href: string; label: string };

const FIXED: Record<string, string> = {
  "/": "Home",
  "/items": "Items",
  "/items/untyped": "Items without a type",
  "/boxes": "Boxes",
  "/locations": "Locations",
  "/events": "Events",
  "/search": "Search results",
  "/activity": "Recent activity",
};

/** A readable name for a page of this app ("BOX-0012", a location's name…), or null if it isn't one we link back to. */
async function labelFor(path: string): Promise<string | null> {
  if (FIXED[path]) return FIXED[path];
  const [, section, id, ...rest] = path.split("/");
  if (rest.length || !id) return null;
  if (section === "boxes") {
    const boxId = parseBoxCode(id);
    return boxId ? boxCode(boxId) : null;
  }
  const n = toId(id);
  if (!n) return null;
  const select = { name: true } as const;
  if (section === "items") return (await db.item.findUnique({ where: { id: n }, select }))?.name ?? null;
  if (section === "locations") return (await db.location.findUnique({ where: { id: n }, select }))?.name ?? null;
  if (section === "events") return (await db.event.findUnique({ where: { id: n }, select }))?.name ?? null;
  return null;
}

/**
 * The "← Back" link for a page that can be opened from several places:
 * where the person came from (the ?back= parameter, see src/lib/back.ts),
 * or the page's usual parent when there is none.
 */
export async function backLink(raw: string | string[] | undefined, fallback: BackLink): Promise<BackLink> {
  const href = safeBackPath(raw);
  if (!href) return fallback;
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const label = await labelFor(path);
  return label ? { href, label } : fallback;
}
