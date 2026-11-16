import type { Metadata } from "next";
import Link from "next/link";
import { BoxList, boxPreview } from "@/components/box-list";
import { CalendarIcon, ChevronRightIcon, PinIcon } from "@/components/icons";
import { ItemGrid } from "@/components/item-grid";
import { SearchBox } from "@/components/search-box";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { pathWithQuery } from "@/lib/back";
import { eventPhase, formatDayRange, PHASE_LABEL, PHASE_TONE, todayIn } from "@/lib/days";
import { plural } from "@/lib/format";
import { str } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { boxesList, searchEvents, searchItems, searchLocations } from "@/server/queries";

export const metadata: Metadata = { title: "Search" };

/** How many items to show here; the Items page shows them all. */
const ITEM_LIMIT = 30;

type Boxes = Awaited<ReturnType<typeof boxesList>>;
type Items = Awaited<ReturnType<typeof searchItems>>;

/**
 * "Find anything" (the search box on Home): one search across events,
 * locations, boxes and items. Browsing everything is what the Items and
 * Boxes pages are for.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const q = str((await searchParams).q).trim();
  // With nothing typed there is nothing to look for (the two list queries would return everything).
  const [events, locations, boxes, { items, more }] = await Promise.all([
    searchEvents(q),
    searchLocations(q),
    q ? boxesList({ q, take: 30 }) : Promise.resolve<Boxes>([]),
    q ? searchItems({ q, take: ITEM_LIMIT }) : Promise.resolve<Items>({ items: [], more: false }),
  ]);
  const here = pathWithQuery("/search", { q });
  const today = todayIn(config().APP_TIMEZONE);
  const nothing = Boolean(q) && events.length + locations.length + boxes.length + items.length === 0;

  return (
    <>
      <PageHeader back={{ href: "/", label: "Home" }} title="Search" />
      <SearchBox placeholder="Item, box, event or location…" autoFocus={!q} />

      {!q && (
        <Card className="mt-3 p-4 text-gray-700">
          <p>Type to look through everything at once:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            <li>items, by name, type, company or description</li>
            <li>boxes, by number, DHL number, description or what&apos;s inside</li>
            <li>events and locations, by name</li>
          </ul>
          <p className="mt-3 text-sm">
            To browse instead, see{" "}
            <Link href="/items" className="font-medium text-brand-700">
              Items
            </Link>{" "}
            or{" "}
            <Link href="/boxes" className="font-medium text-brand-700">
              Boxes
            </Link>
            .
          </p>
        </Card>
      )}

      {nothing && (
        <div className="mt-3">
          <EmptyState>Nothing matches &ldquo;{q}&rdquo;. Try fewer or shorter words.</EmptyState>
        </div>
      )}

      {events.length > 0 && (
        <>
          <SectionTitle>Events</SectionTitle>
          <Card>
            <ul className="divide-y divide-gray-100">
              {events.map((e) => {
                const phase = eventPhase(e, today);
                return (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                      <CalendarIcon className="shrink-0 text-brand-600" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{e.name}</span>
                          <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
                        </span>
                        <span className="block text-sm text-gray-600">
                          {e.venue.name} · {formatDayRange(e.startDate, e.endDate)}
                        </span>
                      </span>
                      <ChevronRightIcon className="shrink-0 text-gray-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      {locations.length > 0 && (
        <>
          <SectionTitle>Locations</SectionTitle>
          <Card>
            <ul className="divide-y divide-gray-100">
              {locations.map((l) => (
                <li key={l.id}>
                  <Link href={`/locations/${l.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                    <PinIcon className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{l.name}</span>
                        <Badge tone={l.type === "STORAGE" ? "brand" : "amber"}>{l.type === "STORAGE" ? "Storage" : "Event venue"}</Badge>
                      </span>
                      <span className="block text-sm text-gray-600">{l.country}</span>
                    </span>
                    <ChevronRightIcon className="shrink-0 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {boxes.length > 0 && (
        <>
          <SectionTitle
            actions={
              <Link href={pathWithQuery("/boxes", { q })} className="text-sm font-medium text-brand-700">
                Open in Boxes →
              </Link>
            }
          >
            Boxes <span className="font-normal text-gray-500">· {boxes.length}</span>
          </SectionTitle>
          <BoxList boxes={boxes.map((b) => boxPreview(b, { showLocation: true }))} back={here} />
        </>
      )}

      {items.length > 0 && (
        <>
          <SectionTitle
            actions={
              <Link href={pathWithQuery("/items", { q })} className="text-sm font-medium text-brand-700">
                {more ? "See all in Items →" : "Open in Items →"}
              </Link>
            }
          >
            Items{" "}
            <span className="font-normal text-gray-500">
              · {more ? `first ${ITEM_LIMIT}` : plural(items.length, "item")}
            </span>
          </SectionTitle>
          <ItemGrid items={items} back={here} />
        </>
      )}
    </>
  );
}
