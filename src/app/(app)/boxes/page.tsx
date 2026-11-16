import type { Metadata } from "next";
import Link from "next/link";
import { BoxList, boxPreview } from "@/components/box-list";
import { FilterSelect } from "@/components/filter-bar";
import { SearchBox } from "@/components/search-box";
import { cx, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { pathWithQuery } from "@/lib/back";
import { plural } from "@/lib/format";
import { str, toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeLocations, boxesList } from "@/server/queries";

export const metadata: Metadata = { title: "Boxes" };

/**
 * Every box, grouped by where it is (boxes on the move first), each with a
 * preview of what's inside. Search by number, DHL number, description or contents.
 */
export default async function BoxesPage({ searchParams }: PageProps<"/boxes">) {
  await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const inTransit = sp.place === "transit";
  const locationId = inTransit ? undefined : toId(sp.place);
  const eventId = toId(sp.event);

  const [locations, events, boxes] = await Promise.all([
    activeLocations(),
    // Only events that are still open: a box keeps its last event after the wrap-up.
    db.event.findMany({
      where: { wrappedUpAt: null },
      select: { id: true, name: true },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    }),
    boxesList({ q, locationId, inTransit, eventId }),
  ]);

  const moving = boxes.filter((b) => b.status === "IN_TRANSIT");
  const groups = locations
    .map((location) => ({ location, boxes: boxes.filter((b) => b.status === "AT_LOCATION" && b.locationId === location.id) }))
    .filter((g) => g.boxes.length > 0);
  // Safety net: a box somewhere that isn't in the list of active locations is still shown.
  const elsewhere = boxes.filter((b) => b.status === "AT_LOCATION" && !locations.some((l) => l.id === b.locationId));
  const empty = boxes.filter((b) => b.holdings.length === 0).length;

  /** This list as it is now, so a box's back link returns to the same search and filters. */
  const here = pathWithQuery("/boxes", { q, place: inTransit ? "transit" : locationId, event: eventId });
  const filtered = Boolean(q || inTransit || locationId || eventId);
  const showEventFilter = events.length > 0 || Boolean(eventId);
  const count = (n: number) => <span className="font-normal text-gray-500">· {plural(n, "box", "boxes")}</span>;

  return (
    <>
      <PageHeader title="Boxes" actions={<LinkButton href="/boxes/new">Pack a box</LinkButton>} />
      <div className="space-y-2">
        <SearchBox placeholder="Number, description or what's inside…" />
        <div className={cx("grid gap-2 sm:max-w-2xl", showEventFilter && "grid-cols-2")}>
          <FilterSelect
            param="place"
            label="Where"
            allLabel="Everywhere"
            options={[{ value: "transit", label: "In transit" }, ...locations.map((l) => ({ value: String(l.id), label: l.name }))]}
          />
          {showEventFilter && (
            <FilterSelect
              param="event"
              label="Event"
              allLabel="Any event"
              options={events.map((e) => ({ value: String(e.id), label: `For ${e.name}` }))}
            />
          )}
        </div>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        {plural(boxes.length, "box", "boxes")}
        {empty > 0 && ` · ${empty} empty`}
      </p>

      {boxes.length === 0 && (
        <div className="mt-3">
          <EmptyState>
            {filtered ? (
              <>
                No boxes match. Try fewer words or filters, or{" "}
                <Link href="/boxes" className="font-medium text-brand-700">
                  show all boxes
                </Link>
                .
              </>
            ) : (
              "No boxes yet. Use Pack a box to create the first one."
            )}
          </EmptyState>
        </div>
      )}

      {moving.length > 0 && (
        <>
          <SectionTitle>In transit {count(moving.length)}</SectionTitle>
          <BoxList boxes={moving.map((b) => boxPreview(b, { showLocation: false }))} back={here} />
        </>
      )}

      {groups.map((group) => (
        <section key={group.location.id}>
          <SectionTitle>
            <Link href={`/locations/${group.location.id}`} className="text-brand-800 underline-offset-2 hover:underline">
              {group.location.name}
            </Link>{" "}
            {count(group.boxes.length)}
          </SectionTitle>
          <BoxList boxes={group.boxes.map((b) => boxPreview(b, { showLocation: false }))} back={here} />
        </section>
      ))}

      {elsewhere.length > 0 && (
        <>
          <SectionTitle>Elsewhere {count(elsewhere.length)}</SectionTitle>
          <BoxList boxes={elsewhere.map((b) => boxPreview(b, { showLocation: true }))} back={here} />
        </>
      )}
    </>
  );
}
