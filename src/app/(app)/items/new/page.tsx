import type { Metadata } from "next";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeCompanies, activeLocations } from "@/server/queries";
import { QuickAddForm } from "./quick-add-form";

export const metadata: Metadata = { title: "Add item" };

export default async function NewItemPage({ searchParams }: PageProps<"/items/new">) {
  await requireUser();
  const sp = await searchParams;
  const fromId = toId(sp.from);
  const [companies, locations, boxes, original] = await Promise.all([
    activeCompanies(),
    activeLocations(),
    db.box.findMany({ where: { deletedAt: null, status: "AT_LOCATION" }, orderBy: { id: "desc" } }),
    fromId ? db.item.findUnique({ where: { id: fromId }, include: { companies: true } }) : null,
  ]);
  const requested = toId(sp.location);
  const defaultLocationId = locations.find((l) => l.id === requested)?.id;
  const activeCompanyIds = new Set(companies.map((c) => c.id));

  return (
    <>
      <PageHeader
        title={original ? "Duplicate item" : "Add item"}
        actions={
          <LinkButton href="/items/bulk" variant="secondary" className="hidden md:inline-flex">
            Bulk entry
          </LinkButton>
        }
      />
      {locations.length === 0 || companies.length === 0 ? (
        <EmptyState>An administrator needs to add at least one company and one location first.</EmptyState>
      ) : (
        <QuickAddForm
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name, country: l.country }))}
          boxes={boxes.map((b) => ({ id: b.id, code: boxCode(b.id), locationId: b.locationId!, description: b.description }))}
          defaultLocationId={defaultLocationId}
          duplicateOf={
            original
              ? {
                  id: original.id,
                  name: original.name,
                  companyIds: original.companies.map((c) => c.companyId).filter((id) => activeCompanyIds.has(id)),
                }
              : undefined
          }
        />
      )}
    </>
  );
}
