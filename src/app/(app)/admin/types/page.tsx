import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { plural } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { countUntyped, itemTypes } from "@/server/queries";
import { AddTypeForm, TypeRow } from "./types-client";

export const metadata: Metadata = { title: "Item types" };

/**
 * The shared list of item types (Banner, Leaflet, Booklet…). Everyone can add
 * to it while filling in an item; renaming and deleting happens here.
 */
export default async function TypesPage() {
  await requireAdmin();
  const [types, untyped] = await Promise.all([itemTypes(), countUntyped()]);
  return (
    <>
      <PageHeader
        back={{ href: "/menu", label: "More" }}
        title="Item types"
        subtitle="What kind of thing an item is, e.g. Banner, Leaflet or Booklet. Optional, and used to find items faster."
      />
      <Card className="max-w-2xl p-4">
        <AddTypeForm />
      </Card>
      {untyped > 0 && (
        <p className="mt-3 max-w-2xl text-sm text-gray-700">
          {plural(untyped, "item")} {untyped === 1 ? "has" : "have"} no type yet.{" "}
          <Link href="/items/untyped" className="font-medium text-brand-700">
            Give them one quickly →
          </Link>
        </p>
      )}
      <SectionTitle>All types</SectionTitle>
      {types.length === 0 ? (
        <div className="max-w-2xl">
          <EmptyState>No types yet. Add the first one above, or while adding an item.</EmptyState>
        </div>
      ) : (
        <Card className="max-w-2xl">
          <ul className="divide-y divide-gray-100">
            {types.map((t) => (
              <li key={t.id}>
                <TypeRow type={{ id: t.id, name: t.name, itemCount: t._count.items }} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
