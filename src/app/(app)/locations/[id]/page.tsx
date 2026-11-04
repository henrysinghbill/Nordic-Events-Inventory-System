import { notFound } from "next/navigation";
import { BoxList } from "@/components/box-list";
import { FilterSelect } from "@/components/filter-bar";
import { HistoryList } from "@/components/history-list";
import { ItemGrid } from "@/components/item-grid";
import { Badge, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { boxCode, plural } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { activeCompanies, boxesAtLocation, history, locationDetail } from "@/server/queries";
import { EmptyBoxes } from "./empty-boxes";

export default async function LocationPage({ params, searchParams }: PageProps<"/locations/[id]">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const companyId = toId((await searchParams).company);
  const [data, companies, allBoxes, entries] = await Promise.all([
    locationDetail(id, companyId),
    activeCompanies(),
    boxesAtLocation(id),
    history({ OR: [{ locationId: id }, { fromLocationId: id }, { toLocationId: id }] }, 30),
  ]);
  if (!data) notFound();
  const { location, loose } = data;
  const pieces = loose.reduce((sum, h) => sum + h.quantity, 0);

  const filled = allBoxes.filter((b) => b.holdings.length > 0);
  const empty = allBoxes.filter((b) => b.holdings.length === 0);
  const boxes = companyId
    ? filled.filter((b) => b.holdings.some((h) => h.item.companies.some((c) => c.companyId === companyId)))
    : filled;

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
              <LinkButton href={`/boxes/new?location=${location.id}`}>Pack a box</LinkButton>
              <LinkButton href={`/items/new?location=${location.id}`} variant="secondary">
                + Add items
              </LinkButton>
            </>
          )
        }
      />
      {location.notes && <p className="mb-4 whitespace-pre-line text-gray-700">{location.notes}</p>}

      <div className="flex gap-2">
        <FilterSelect
          param="company"
          label="Filter by company"
          allLabel="All companies"
          options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
        />
      </div>

      <SectionTitle
        actions={
          loose.length > 0 && (
            <LinkButton href={`/locations/${location.id}/count`} variant="ghost">
              Count / adjust
            </LinkButton>
          )
        }
      >
        Loose items <span className="font-normal text-gray-500">· {plural(loose.length, "item")}, {plural(pieces, "piece")}</span>
      </SectionTitle>
      {loose.length === 0 ? (
        <EmptyState>{companyId ? "No loose items for this company here." : "No loose items here."}</EmptyState>
      ) : (
        <ItemGrid
          items={loose.map((h) => ({
            id: h.item.id,
            name: h.item.name,
            photoKey: h.item.photos[0]?.key ?? null,
            quantity: h.quantity,
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
        <EmptyState>{companyId ? "No boxes with this company's items here." : "No packed boxes here."}</EmptyState>
      ) : (
        <BoxList boxes={boxes} />
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
