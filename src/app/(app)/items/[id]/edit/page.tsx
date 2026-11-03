import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { EditItemForm } from "../item-client";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: PageProps<"/items/[id]/edit">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const item = await db.item.findUnique({ where: { id }, include: { companies: true } });
  if (!item) notFound();
  const itemCompanyIds = item.companies.map((c) => c.companyId);
  // Show active companies, plus any archived ones this item is still tagged with.
  const companies = await db.company.findMany({
    where: { OR: [{ archivedAt: null }, { id: { in: itemCompanyIds } }] },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader back={{ href: `/items/${item.id}`, label: item.name }} title="Edit item" />
      <Card className="max-w-xl p-4">
        <EditItemForm
          item={{
            id: item.id,
            name: item.name,
            description: item.description,
            lowStockThreshold: item.lowStockThreshold,
            companyIds: itemCompanyIds,
          }}
          companies={companies.map((c) => ({ id: c.id, name: c.archivedAt ? `${c.name} (archived)` : c.name }))}
        />
      </Card>
    </>
  );
}
