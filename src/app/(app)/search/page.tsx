import type { Metadata } from "next";
import { FilterSelect } from "@/components/filter-bar";
import { ItemGrid } from "@/components/item-grid";
import { EmptyState, PageHeader } from "@/components/ui";
import { plural } from "@/lib/format";
import { str, toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { activeCompanies, activeLocations, searchItems } from "@/server/queries";
import { ArchivedToggle, SearchBox } from "./search-box";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const companyId = toId(sp.company);
  const locationId = toId(sp.location);
  const includeArchived = sp.archived === "1";

  const [companies, locations, items] = await Promise.all([
    activeCompanies(),
    activeLocations(),
    searchItems({ q, companyId, locationId, includeArchived }),
  ]);
  const filtered = Boolean(q || companyId || locationId);

  return (
    <>
      <PageHeader title="Search" />
      <div className="space-y-2">
        <SearchBox placeholder="Item name…" />
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
