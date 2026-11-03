import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoryList } from "@/components/history-list";
import { Badge, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { activeLocations, history, itemDetail } from "@/server/queries";
import { AddStockForm, ArchiveButton, ItemPhotos } from "./item-client";

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const [item, locations, entries] = await Promise.all([itemDetail(id), activeLocations(), history({ itemId: id }, 50)]);
  if (!item) notFound();

  const holdings = item.holdings.filter((h) => !h.box?.deletedAt);
  const total = holdings.reduce((sum, h) => sum + h.quantity, 0);
  const low = item.lowStockThreshold !== null && total < item.lowStockThreshold;

  return (
    <>
      <PageHeader
        back={{ href: "/search", label: "Search" }}
        title={item.name}
        subtitle={
          <span className="flex flex-wrap gap-1.5 pt-1">
            {item.companies.map((c) => (
              <Badge key={c.companyId} tone="brand">
                {c.company.name}
              </Badge>
            ))}
            {item.archivedAt && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          <LinkButton href={`/items/${item.id}/edit`} variant="secondary">
            Edit
          </LinkButton>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <ItemPhotos itemId={item.id} name={item.name} photos={item.photos.map((p) => ({ id: p.id, key: p.key }))} />

        <div>
          <Card className="p-4">
            <p className="text-sm text-gray-600">Total quantity</p>
            <p className="text-4xl font-bold">{total}</p>
            {low && (
              <p className="mt-1">
                <Badge tone="red">Low stock (warning below {item.lowStockThreshold})</Badge>
              </p>
            )}
          </Card>
          {item.description && <p className="mt-4 whitespace-pre-line text-gray-800">{item.description}</p>}

          <SectionTitle>Where it is</SectionTitle>
          {holdings.length === 0 ? (
            <EmptyState>None in stock anywhere.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-gray-100">
                {holdings.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      {h.location ? (
                        <>
                          <Link href={`/locations/${h.location.id}`} className="font-medium text-brand-700">
                            {h.location.name}
                          </Link>
                          <p className="text-sm text-gray-600">Loose</p>
                        </>
                      ) : h.box?.status === "IN_TRANSIT" ? (
                        <>
                          <p className="font-medium">
                            {boxCode(h.box.id)} <Badge tone="amber">In transit</Badge>
                          </p>
                          <p className="text-sm text-gray-600">
                            {h.box.origin?.name} → {h.box.destination?.name}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium">{h.box && boxCode(h.box.id)}</p>
                          <p className="text-sm text-gray-600">In a box at {h.box?.location?.name}</p>
                        </>
                      )}
                    </div>
                    <span className="text-xl font-semibold">{h.quantity}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!item.archivedAt && (
            <div className="mt-3">
              <AddStockForm
                itemId={item.id}
                locations={locations.map((l) => ({ id: l.id, name: l.name, country: l.country }))}
              />
            </div>
          )}
        </div>
      </div>

      <SectionTitle>History</SectionTitle>
      <HistoryList entries={entries} />

      <div className="mt-6">
        <ArchiveButton itemId={item.id} archived={Boolean(item.archivedAt)} quantity={total} />
      </div>
    </>
  );
}
