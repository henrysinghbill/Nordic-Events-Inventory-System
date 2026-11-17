import { notFound } from "next/navigation";
import { BoxList } from "@/components/box-list";
import { FilterSelect } from "@/components/filter-bar";
import { HistoryList } from "@/components/history-list";
import { ItemGrid } from "@/components/item-grid";
import { SearchBox } from "@/components/search-box";
import { Badge, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { pathWithQuery, withBack } from "@/lib/back";
import { initials } from "@/lib/company-match";
import { boxCode, plural } from "@/lib/format";
import { str, toId } from "@/lib/params";
import { matchesAll, searchTerms } from "@/lib/search-text";
import { requireUser } from "@/server/auth/session";
import { activeCompanies, boxesAtLocation, history, locationDetail } from "@/server/queries";
import { EmptyBoxes } from "./empty-boxes";

export default async function LocationPage({ params, searchParams }: PageProps<"/locations/[id]">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const sp = await searchParams;
  const companyId = toId(sp.company);
  const q = str(sp.q).trim();
  const terms = searchTerms(q);
  const [data, companies, allBoxes, entries] = await Promise.all([
    locationDetail(id, companyId),
    activeCompanies(),
    boxesAtLocation(id),
    history({ OR: [{ locationId: id }, { fromLocationId: id }, { toLocationId: id }] }, 30),
  ]);
  if (!data) notFound();
  const { location } = data;

  // The search works like the one on Items: every word must appear in the item's name, type,
  // companies (or their initials, e.g. "FF") or description. A box matches by its number,
  // its description, or anything inside it.
  type ItemText = { name: string; description: string | null; type: { name: string } | null; companies: { company: { name: string } }[] };
  const itemText = (i: ItemText) => {
    const names = i.companies.map((c) => c.company.name);
    return [i.name, i.description ?? "", i.type?.name ?? "", ...names, ...names.map(initials)].join(" ");
  };
  const loose = data.loose.filter((h) => matchesAll(itemText(h.item), terms));
  const pieces = loose.reduce((sum, h) => sum + h.quantity, 0);

  const filled = allBoxes.filter((b) => b.holdings.length > 0);
  const boxDigits = /^(?:BOX[-\s]*)?0*(\d{1,9})$/i.exec(q)?.[1];
  const boxMatches = (b: (typeof allBoxes)[number]) =>
    (boxDigits !== undefined && b.id === Number(boxDigits)) ||
    matchesAll(`${boxCode(b.id)} ${b.description ?? ""}`, terms) ||
    terms.every((t) => b.holdings.some((h) => matchesAll(itemText(h.item), [t])));
  const boxes = filled.filter(
    (b) =>
      (!companyId || b.holdings.some((h) => h.item.companies.some((c) => c.companyId === companyId))) &&
      (!q || boxMatches(b)),
  );
  // Empty boxes only follow the search (they have no company to filter by).
  const empty = allBoxes.filter((b) => b.holdings.length === 0 && (!q || boxMatches(b)));
  /** This page as it is now, so items and boxes opened from here link back to it. */
  const here = pathWithQuery(`/locations/${location.id}`, { company: companyId, q });

  return (
    <>
      <PageHeader
        back={{ href: "/locations", label: "Locations" }}
        title={location.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {location.country}
            <Badge tone={location.type === "STORAGE" ? "brand" : "amber"}>
              {location.type === "STORAGE" ? "Storage" : "Event venue"}
            </Badge>
            {location.archivedAt && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          !location.archivedAt && (
            <>
              <LinkButton href={withBack(`/boxes/new?location=${location.id}`, here)}>Pack a box</LinkButton>
              <LinkButton href={withBack(`/items/new?location=${location.id}`, here)} variant="secondary">
                + Add items
              </LinkButton>
            </>
          )
        }
      />
      {location.notes && <p className="mb-4 whitespace-pre-line text-gray-700">{location.notes}</p>}

      <div className="space-y-2">
        <SearchBox placeholder="Search items and boxes here…" />
        <FilterSelect
          param="company"
          label="Filter by company"
          allLabel="All companies"
          options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
        />
      </div>

      <SectionTitle
        actions={
          data.loose.length > 0 && (
            <LinkButton href={`/locations/${location.id}/count`} variant="ghost">
              Count / adjust
            </LinkButton>
          )
        }
      >
        Loose items <span className="font-normal text-gray-500">· {plural(loose.length, "item")}, {plural(pieces, "piece")}</span>
      </SectionTitle>
      {loose.length === 0 ? (
        <EmptyState>
          {q ? "No loose items here match that search." : companyId ? "No loose items for this company here." : "No loose items here."}
        </EmptyState>
      ) : (
        <ItemGrid
          back={here}
          items={loose.map((h) => ({
            id: h.item.id,
            name: h.item.name,
            photoKey: h.item.photos[0]?.key ?? null,
            quantity: h.quantity,
            type: h.item.type?.name,
            companies: h.item.companies.map((c) => c.company.name).sort(),
            archived: Boolean(h.item.archivedAt),
          }))}
        />
      )}

      <SectionTitle
        actions={
          allBoxes.length > 0 && (
            <LinkButton href={`/print/labels?location=${location.id}`} variant="ghost">
              Print labels
            </LinkButton>
          )
        }
      >
        Boxes <span className="font-normal text-gray-500">· {boxes.length}</span>
      </SectionTitle>
      {boxes.length === 0 ? (
        <EmptyState>
          {q ? "No boxes here match that search." : companyId ? "No boxes with this company's items here." : "No packed boxes here."}
        </EmptyState>
      ) : (
        <BoxList boxes={boxes} back={here} />
      )}

      {empty.length > 0 && (
        <>
          <SectionTitle>
            Empty boxes <span className="font-normal text-gray-500">· {empty.length}</span>
          </SectionTitle>
          <EmptyBoxes boxes={empty.map((b) => ({ id: b.id, code: boxCode(b.id), description: b.description }))} />
        </>
      )}

      <SectionTitle>History</SectionTitle>
      <HistoryList entries={entries} />
    </>
  );
}
