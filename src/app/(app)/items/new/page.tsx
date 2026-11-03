import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeCompanies, activeLocations } from "@/server/queries";
import { QuickAddForm } from "./quick-add-form";

export const metadata: Metadata = { title: "Add item" };

export default async function NewItemPage({ searchParams }: PageProps<"/items/new">) {
  await requireUser();
  const [companies, locations, boxes] = await Promise.all([
    activeCompanies(),
    activeLocations(),
    db.box.findMany({ where: { deletedAt: null, status: "AT_LOCATION" }, orderBy: { id: "desc" } }),
  ]);
  const requested = toId((await searchParams).location);
  const defaultLocationId = locations.find((l) => l.id === requested)?.id;

  return (
    <>
      <PageHeader title="Add item" />
      {locations.length === 0 || companies.length === 0 ? (
        <EmptyState>An administrator needs to add at least one company and one location first.</EmptyState>
      ) : (
        <QuickAddForm
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name, country: l.country }))}
          boxes={boxes.map((b) => ({ id: b.id, code: boxCode(b.id), locationId: b.locationId!, description: b.description }))}
          defaultLocationId={defaultLocationId}
        />
      )}
    </>
  );
}
