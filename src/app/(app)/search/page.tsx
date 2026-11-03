import type { Metadata } from "next";
import Link from "next/link";
import { FilterSelect } from "@/components/filter-bar";
import { BoxIcon, ChevronRightIcon } from "@/components/icons";
import { ItemGrid } from "@/components/item-grid";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { boxCode, plural } from "@/lib/format";
import { str, toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { activeCompanies, activeLocations, searchBoxes, searchItems } from "@/server/queries";
import { ArchivedToggle, SearchBox } from "./search-box";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const companyId = toId(sp.company);
  const locationId = toId(sp.location);
  const includeArchived = sp.archived === "1";

  const [companies, locations, items, boxes] = await Promise.all([
    activeCompanies(),
    activeLocations(),
    searchItems({ q, companyId, locationId, includeArchived }),
    searchBoxes(q, locationId),
  ]);
  const filtered = Boolean(q || companyId || locationId);

  return (
    <>
      <PageHeader title="Search" />
      <div className="space-y-2">
        <SearchBox placeholder="Item name, box code or barcode…" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <FilterSelect
            param="company"
            label="Company"
            allLabel="All companies"
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          />
          <FilterSelect
            param="location"
            label="Location"
            allLabel="All locations"
            options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
          />
        </div>
        <ArchivedToggle />
      </div>

      {boxes.length > 0 && (
        <>
          <SectionTitle>Boxes</SectionTitle>
          <Card className="mb-2">
            <ul className="divide-y divide-gray-100">
              {boxes.map((b) => (
                <li key={b.id}>
                  <Link href={`/boxes/${boxCode(b.id)}`} className="flex min-h-14 items-center gap-3 px-4 active:bg-gray-50">
                    <BoxIcon className="text-brand-700" />
                    <span className="flex-1">
                      <span className="block font-semibold">{boxCode(b.id)}</span>
                      <span className="text-sm text-gray-600">
                        {b.location ? b.location.name : `In transit to ${b.destination?.name}`} · {plural(b._count.holdings, "item")}
                      </span>
                    </span>
                    <ChevronRightIcon className="text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <SectionTitle>Items</SectionTitle>
        </>
      )}
      <p className="mt-2 mb-3 text-sm text-gray-600">
        {plural(items.length, "item")}
        {locationId ? " (quantities at the chosen location)" : ""}
      </p>
      {items.length === 0 ? (
        <EmptyState>{filtered ? "Nothing matches. Try a shorter search or fewer filters." : "No items yet. Tap Add to create the first one."}</EmptyState>
      ) : (
        <ItemGrid items={items} />
      )}
    </>
  );
}
