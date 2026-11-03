import type { Metadata } from "next";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { AddLocation, LocationRow } from "./locations-client";

export const metadata: Metadata = { title: "Manage locations" };

export default async function AdminLocationsPage() {
  await requireAdmin();
  const locations = await db.location.findMany({
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { type: "asc" }, { name: "asc" }],
  });
  return (
    <>
      <PageHeader back={{ href: "/menu", label: "More" }} title="Manage locations" />
      <AddLocation />
      <SectionTitle>All locations</SectionTitle>
      <Card className="max-w-2xl">
        <ul className="divide-y divide-gray-100">
          {locations.map((l) => (
            <li key={l.id}>
              <LocationRow
                loc={{ id: l.id, name: l.name, country: l.country, type: l.type, notes: l.notes, archived: Boolean(l.archivedAt) }}
              />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
