import type { Metadata } from "next";
import Link from "next/link";
import type { HistoryEntry } from "@/generated/prisma/client";
import { HistoryList, type HistoryLink } from "@/components/history-list";
import { EmptyState, LinkButton, PageHeader, SectionTitle, inputClass } from "@/components/ui";
import { pathWithQuery, withBack } from "@/lib/back";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { fmtDate } from "@/server/dates";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Recent activity" };

const PAGE = 100;

/** Everything that happened, newest first, across all items, boxes, locations and events. */
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  await requireUser();
  const sp = await searchParams;
  const before = toId(sp.before);
  const userId = toId(sp.user);

  const [entries, users] = await Promise.all([
    db.historyEntry.findMany({
      where: { ...(before ? { id: { lt: before } } : {}), ...(userId ? { userId } : {}) },
      orderBy: { id: "desc" },
      take: PAGE + 1,
    }),
    db.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);
  const more = entries.length > PAGE;
  const shown = entries.slice(0, PAGE);

  // Names for the links under each entry.
  const ids = (key: "itemId" | "eventId" | "locationId") => [...new Set(shown.map((e) => e[key]).filter((v): v is number => v !== null))];
  const [items, events, locations] = await Promise.all([
    db.item.findMany({ where: { id: { in: ids("itemId") } }, select: { id: true, name: true } }),
    db.event.findMany({ where: { id: { in: ids("eventId") } }, select: { id: true, name: true } }),
    db.location.findMany({ where: { id: { in: ids("locationId") } }, select: { id: true, name: true } }),
  ]);
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  /** This page as it is now, so an item or box opened from here links back to the same place in the list. */
  const here = pathWithQuery("/activity", { user: userId, before });
  const links = (e: HistoryEntry): HistoryLink[] => {
    const out: HistoryLink[] = [];
    if (e.itemId && itemName.has(e.itemId)) out.push({ href: withBack(`/items/${e.itemId}`, here), label: itemName.get(e.itemId)! });
    if (e.boxId) out.push({ href: withBack(`/boxes/${boxCode(e.boxId)}`, here), label: boxCode(e.boxId) });
    if (e.eventId && eventName.has(e.eventId)) out.push({ href: `/events/${e.eventId}`, label: eventName.get(e.eventId)! });
    if (!e.itemId && !e.boxId && e.locationId && locationName.has(e.locationId)) {
      out.push({ href: `/locations/${e.locationId}`, label: locationName.get(e.locationId)! });
    }
    return out;
  };

  // Group by day.
  const days: { day: string; entries: HistoryEntry[] }[] = [];
  for (const e of shown) {
    const day = fmtDate(e.createdAt);
    if (days.at(-1)?.day === day) days.at(-1)!.entries.push(e);
    else days.push({ day, entries: [e] });
  }
  const olderHref = () => {
    const p = new URLSearchParams();
    if (userId) p.set("user", String(userId));
    p.set("before", String(shown.at(-1)!.id));
    return `/activity?${p}`;
  };

  return (
    <>
      <PageHeader title="Recent activity" subtitle="Everything that has changed, newest first." />
      <form className="mb-2 flex gap-2">
        <select name="user" defaultValue={userId ?? ""} className={inputClass} aria-label="Show changes by">
          <option value="">Everyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-white px-4 font-semibold ring-1 ring-gray-300 active:bg-gray-100">
          Show
        </button>
      </form>
      {before && (
        <p className="mb-2">
          <Link href={userId ? `/activity?user=${userId}` : "/activity"} className="font-medium text-brand-700">
            ← Back to the newest
          </Link>
        </p>
      )}

      {days.length === 0 ? (
        <EmptyState>Nothing to show.</EmptyState>
      ) : (
        days.map((d) => (
          <section key={d.day + d.entries[0].id}>
            <SectionTitle>{d.day}</SectionTitle>
            <HistoryList entries={d.entries} links={links} />
          </section>
        ))
      )}
      {more && (
        <div className="mt-4">
          <LinkButton href={olderHref()} variant="secondary" className="w-full">
            Show older
          </LinkButton>
        </div>
      )}
    </>
  );
}
