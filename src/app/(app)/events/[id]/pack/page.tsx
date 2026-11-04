import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, cx, EmptyState, PageHeader } from "@/components/ui";
import { boxCode, plural } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { packSuggestions } from "@/server/events";
import { activeLocations, eventDetail, locationDetail, looseStockOf } from "@/server/queries";
import { EventPackForm, type PackRow } from "./event-pack-form";

export const metadata: Metadata = { title: "Pack for event" };

export default async function PackForEventPage({ params, searchParams }: PageProps<"/events/[id]/pack">) {
  await requireUser();
  const id = toId((await params).id);
  const event = id ? await eventDetail(id) : null;
  if (!event) notFound();
  if (event.wrappedUpAt) redirect(`/events/${event.id}`);

  // What's still needed, and how much of it each location could supply.
  const packed = new Map<number, number>();
  for (const b of event.boxes) for (const h of b.holdings) packed.set(h.item.id, (packed.get(h.item.id) ?? 0) + h.quantity);
  const list = event.lines.map((l) => ({ itemId: l.itemId, needed: l.quantity }));
  const [locations, loose] = await Promise.all([activeLocations(), looseStockOf(list.map((l) => l.itemId))]);
  const sources = locations
    .filter((l) => l.id !== event.venueId)
    .map((l) => {
      const here = new Map(loose.filter((h) => h.locationId === l.id).map((h) => [h.itemId, h.quantity]));
      const pieces = packSuggestions(list, packed, here).reduce((s, x) => s + x.suggest, 0);
      return { ...l, pieces };
    })
    // Storage locations, plus any other place that has something from the list.
    .filter((l) => l.type === "STORAGE" || l.pieces > 0);
  if (sources.length === 0) {
    return (
      <>
        <PageHeader back={{ href: `/events/${event.id}`, label: event.name }} title="Pack a box" />
        <EmptyState>There are no storage locations to pack from. An administrator can add one.</EmptyState>
      </>
    );
  }
  const requested = toId((await searchParams).from);
  // Default: wherever most of the list can be packed from (storage first on a tie).
  const best = [...sources].sort((a, b) => b.pieces - a.pieces || Number(b.type === "STORAGE") - Number(a.type === "STORAGE"))[0];
  const from = sources.find((s) => s.id === requested) ?? best;

  const [detail, boxesHere, openEvents] = await Promise.all([
    locationDetail(from.id),
    db.box.findMany({ where: { locationId: from.id, deletedAt: null, status: "AT_LOCATION" }, include: { _count: { select: { holdings: true } } }, orderBy: { id: "desc" } }),
    db.event.findMany({ where: { wrappedUpAt: null }, select: { id: true } }),
  ]);
  const openIds = new Set(openEvents.map((e) => e.id));
  const holdings = detail?.loose ?? [];
  const available = new Map(holdings.map((h) => [h.item.id, h.quantity]));
  const suggestions = packSuggestions(list, packed, available);
  const toRow = (h: (typeof holdings)[number], start: number, hint?: string): PackRow => ({
    itemId: h.item.id,
    name: h.item.name,
    photoKey: h.item.photos[0]?.key ?? null,
    available: h.quantity,
    companies: h.item.companies.map((c) => c.company.name).join(", "),
    hint,
    start,
  });
  const listRows: PackRow[] = [];
  for (const s of suggestions) {
    const h = holdings.find((x) => x.item.id === s.itemId);
    if (!h) continue;
    const status = s.remaining === 0 ? "all packed" : `${s.remaining} still to pack`;
    listRows.push(toRow(h, s.suggest, `Need ${s.needed} · ${status} · ${s.available} here`));
  }
  const onList = new Set(list.map((l) => l.itemId));
  const otherRows = holdings.filter((h) => !onList.has(h.item.id)).map((h) => toRow(h, 0));
  const missing = suggestions.filter((s) => s.remaining > 0 && s.available === 0);
  const nameOf = new Map(event.lines.map((l) => [l.itemId, l.item.name]));

  const boxes = boxesHere
    .filter((b) => !b.eventId || b.eventId === event.id || !openIds.has(b.eventId))
    .sort((a, b) => Number(b.eventId === event.id) - Number(a.eventId === event.id))
    .map((b) => ({
      id: b.id,
      code: boxCode(b.id),
      label: `${boxCode(b.id)}${b.description ? ` – ${b.description}` : ""} · ${b._count.holdings ? plural(b._count.holdings, "item") : "empty"}`,
      forThisEvent: b.eventId === event.id,
    }));

  return (
    <>
      <PageHeader back={{ href: `/events/${event.id}`, label: event.name }} title="Pack a box" subtitle={`For ${event.name}, from the loose stock at ${from.name}`} />

      {sources.length > 1 && (
        <div className="mb-3">
          <p className="mb-1 text-sm font-medium text-gray-600">Packing from (where you are now):</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <Link
                key={s.id}
                href={`/events/${event.id}/pack?from=${s.id}`}
                replace
                className={cx(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ring-1",
                  s.id === from.id ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-800 ring-gray-300",
                )}
              >
                {s.name}
                {list.length > 0 && <span className="ml-1 opacity-75">({s.pieces})</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {list.length === 0 && (
        <Card className="mb-3 bg-amber-50 p-3 text-amber-900 ring-amber-200">
          This event has no packing list yet, so nothing is filled in.{" "}
          <Link href={`/events/${event.id}/list`} className="font-medium underline">
            Add a packing list
          </Link>
        </Card>
      )}
      {missing.length > 0 && (
        <Card className="mb-3 bg-gray-50 p-3 text-sm text-gray-700">
          Not available at {from.name}: {missing.map((m) => `${nameOf.get(m.itemId)} (${m.remaining} needed)`).join(", ")}
        </Card>
      )}

      {holdings.length === 0 ? (
        <EmptyState>There&apos;s no loose stock at {from.name}.</EmptyState>
      ) : (
        <EventPackForm key={from.id} eventId={event.id} locationId={from.id} boxes={boxes} listRows={listRows} otherRows={otherRows} />
      )}
    </>
  );
}
