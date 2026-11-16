import type { Metadata } from "next";
import Link from "next/link";
import { LinkChips } from "@/components/chips";
import { FilterSelect, MoreFilters } from "@/components/filter-bar";
import { ItemGrid } from "@/components/item-grid";
import { ParamToggle, SearchBox } from "@/components/search-box";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { pathWithQuery } from "@/lib/back";
import { plural } from "@/lib/format";
import { str, toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { activeCompanies, activeLocations, searchItems, typeUsage, type StockFilter } from "@/server/queries";

export const metadata: Metadata = { title: "Items" };

const STOCK: { value: StockFilter; label: string }[] = [
  { value: "in", label: "In stock" },
  { value: "low", label: "Low stock (below its warning level)" },
  { value: "out", label: "Out of stock" },
];

/**
 * Everything we have: one card per item, with search and filters.
 * (Home has "Find anything", which also looks through boxes, events and locations.)
 */
export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  await requireUser();
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const noType = sp.type === "none";
  const companyId = toId(sp.company);
  const locationId = toId(sp.location);
  const stock = STOCK.find((s) => s.value === sp.stock)?.value;
  const missingPhoto = sp.missingPhoto === "1";
  const includeArchived = sp.archived === "1";

  const [companies, locations, usage] = await Promise.all([activeCompanies(), activeLocations(), typeUsage(includeArchived)]);
  // A type that no longer exists (deleted since the link was made) is simply ignored.
  const type = noType ? undefined : usage.all.find((t) => t.id === toId(sp.type));
  const { items, more } = await searchItems({
    q,
    typeId: type?.id,
    noType,
    companyId,
    locationId,
    stock,
    missingPhoto,
    includeArchived,
  });

  const params = {
    q,
    type: noType ? "none" : type?.id,
    company: companyId,
    location: locationId,
    stock,
    missingPhoto: missingPhoto && "1",
    archived: includeArchived && "1",
  };
  /** This list as it is now, so an item's back link returns to the same search and filters. */
  const here = pathWithQuery("/items", params);
  const withType = (value: string | number | undefined) => pathWithQuery("/items", { ...params, type: value });
  const typeChips = [
    { href: withType(undefined), label: "All types", active: !noType && !type },
    ...usage.used.map((t) => ({ href: withType(t.id), label: t.name, active: type?.id === t.id })),
    // A chosen type that nothing (visible) uses still gets its chip, so it can be switched off.
    ...(type && !usage.used.some((t) => t.id === type.id) ? [{ href: withType(type.id), label: type.name, active: true }] : []),
    ...(usage.untyped > 0 || noType ? [{ href: withType("none"), label: "No type", active: noType }] : []),
  ];
  const showTypes = usage.used.length > 0 || Boolean(type) || noType;
  const extraFilters = [stock, missingPhoto, includeArchived].filter(Boolean).length;
  const filtered = Boolean(q || type || noType || companyId || locationId || extraFilters);

  return (
    <>
      <PageHeader
        title="Items"
        actions={
          <>
            <LinkButton href="/items/bulk" variant="secondary" className="max-md:hidden">
              Bulk entry
            </LinkButton>
            <LinkButton href="/items/new">+ Add item</LinkButton>
          </>
        }
      />
      <div className="space-y-2">
        <SearchBox placeholder="Name, type, company or description…" />
        {showTypes && <LinkChips label="Filter by type" chips={typeChips} />}
        <div className="grid grid-cols-2 gap-2">
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
        <MoreFilters activeCount={extraFilters}>
          <div className="sm:max-w-sm">
            <FilterSelect param="stock" label="Stock" allLabel="Any stock level" options={STOCK} />
          </div>
          <div className="flex flex-wrap gap-x-6">
            <ParamToggle param="missingPhoto" label="Missing photo only" />
            <ParamToggle param="archived" label="Include archived items" />
          </div>
        </MoreFilters>
      </div>

      <p className="mt-2 mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-gray-600">
        <span>
          {plural(items.length, "item")}
          {more ? " shown (there are more: search or filter to narrow it down)" : ""}
          {locationId ? " · quantities at the chosen location" : ""}
        </span>
        {noType && items.length > 0 && (
          <Link href="/items/untyped" className="font-medium text-brand-700">
            Give these a type quickly →
          </Link>
        )}
      </p>
      {items.length === 0 ? (
        <EmptyState>
          {filtered ? (
            <>
              Nothing matches. Try fewer words or filters, or{" "}
              <Link href="/items" className="font-medium text-brand-700">
                show all items
              </Link>
              .
            </>
          ) : (
            "No items yet. Use + Add item to create the first one."
          )}
        </EmptyState>
      ) : (
        <ItemGrid items={items} back={here} />
      )}
    </>
  );
}
