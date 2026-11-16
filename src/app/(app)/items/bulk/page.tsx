import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeCompanies, activeLocations, itemTypes } from "@/server/queries";
import { BulkGrid } from "./bulk-grid";

export const metadata: Metadata = { title: "Bulk entry" };

export default async function BulkEntryPage() {
  await requireUser();
  const [companies, types, locations, boxes, items] = await Promise.all([
    activeCompanies(),
    itemTypes(),
    activeLocations(),
    db.box.findMany({ where: { deletedAt: null, status: "AT_LOCATION" }, orderBy: { id: "desc" } }),
    db.item.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/items/new", label: "Add item" }}
        title="Bulk entry"
        subtitle="Type or paste many items at once. Photos can be added afterwards."
      />
      <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 md:hidden">
        Bulk entry works best on a computer. On a phone, use Add item.
      </p>
      {locations.length === 0 || companies.length === 0 ? (
        <EmptyState>An administrator needs to add at least one company and one location first.</EmptyState>
      ) : (
        <BulkGrid
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          boxes={boxes.map((b) => ({ id: b.id, code: boxCode(b.id), locationId: b.locationId! }))}
          items={items}
        />
      )}
    </>
  );
}
