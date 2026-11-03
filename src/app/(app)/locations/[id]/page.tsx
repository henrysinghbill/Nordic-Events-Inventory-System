import { notFound } from "next/navigation";
import { FilterSelect } from "@/components/filter-bar";
import { HistoryList } from "@/components/history-list";
import { ItemGrid } from "@/components/item-grid";
import { Badge, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { plural } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { activeCompanies, history, locationDetail } from "@/server/queries";

export default async function LocationPage({ params, searchParams }: PageProps<"/locations/[id]">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const companyId = toId((await searchParams).company);
  const [data, companies, entries] = await Promise.all([
    locationDetail(id, companyId),
    activeCompanies(),
    history({ OR: [{ locationId: id }, { fromLocationId: id }, { toLocationId: id }] }, 30),
  ]);
  if (!data) notFound();
  const { location, loose } = data;
  const pieces = loose.reduce((sum, h) => sum + h.quantity, 0);

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
            <LinkButton href={`/items/new?location=${location.id}`} variant="secondary">
              + Add items here
            </LinkButton>
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

      <SectionTitle>
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

      <SectionTitle>History</SectionTitle>
      <HistoryList entries={entries} />
    </>
  );
}
