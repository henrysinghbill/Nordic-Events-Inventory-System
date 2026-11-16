import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { safeBackPath, withBack } from "@/lib/back";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { itemTypes } from "@/server/queries";
import { EditItemForm } from "../item-client";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditItemPage({ params, searchParams }: PageProps<"/items/[id]/edit">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const item = await db.item.findUnique({ where: { id }, include: { companies: true } });
  if (!item) notFound();
  const itemCompanyIds = item.companies.map((c) => c.companyId);
  // Show active companies, plus any archived ones this item is still tagged with.
  const [companies, types] = await Promise.all([
    db.company.findMany({
      where: { OR: [{ archivedAt: null }, { id: { in: itemCompanyIds } }] },
      orderBy: { name: "asc" },
    }),
    itemTypes(),
  ]);
  // Keep the item page's own back link (e.g. "← Items" with its filters) through the edit.
  const itemHref = withBack(`/items/${item.id}`, safeBackPath((await searchParams).back));

  return (
    <>
      <PageHeader back={{ href: itemHref, label: item.name }} title="Edit item" />
      <Card className="max-w-xl p-4">
        <EditItemForm
          item={{
            id: item.id,
            name: item.name,
            description: item.description,
            lowStockThreshold: item.lowStockThreshold,
            companyIds: itemCompanyIds,
            typeId: item.typeId,
          }}
          companies={companies.map((c) => ({ id: c.id, name: c.archivedAt ? `${c.name} (archived)` : c.name }))}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
          doneHref={itemHref}
        />
      </Card>
    </>
  );
}
