import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoryList } from "@/components/history-list";
import { Badge, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { safeBackPath, withBack } from "@/lib/back";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { backLink } from "@/server/back";
import { db } from "@/server/db";
import { activeLocations, history, itemDetail } from "@/server/queries";
import { AddStockForm, ArchiveButton, ItemPhotos } from "./item-client";

export default async function ItemPage({ params, searchParams }: PageProps<"/items/[id]">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const cameFrom = safeBackPath((await searchParams).back);
  const [item, locations, entries, back, typesExist] = await Promise.all([
    itemDetail(id),
    activeLocations(),
    history({ itemId: id }, 50),
    // Back to wherever this item was opened from (a box, a location, the Items list with its filters…).
    backLink(cameFrom, { href: "/items", label: "Items" }),
    db.itemType.count().then((n) => n > 0),
  ]);
  if (!item) notFound();
  /** This page's own address, so the pages it links to can come back here. */
  const here = withBack(`/items/${item.id}`, cameFrom);
  const editHref = withBack(`/items/${item.id}/edit`, cameFrom);

  const holdings = item.holdings.filter((h) => !h.box?.deletedAt);
  const total = holdings.reduce((sum, h) => sum + h.quantity, 0);
  const low = item.lowStockThreshold !== null && total < item.lowStockThreshold;

  return (
    <>
      <PageHeader
        back={back}
        title={item.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            {/* The type links to every item of that type. */}
            {item.type && (
              <Link
                href={`/items?type=${item.type.id}`}
                title={`Show all items of the type ${item.type.name}`}
                className="inline-flex items-center rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-white"
              >
                {item.type.name}
              </Link>
            )}
            {item.companies.map((c) => (
              <Badge key={c.companyId} tone="brand">
                {c.company.name}
              </Badge>
            ))}
            {item.archivedAt && <Badge>Archived</Badge>}
            {!item.type && typesExist && !item.archivedAt && (
              <Link href={editHref} className="text-sm font-medium text-brand-700">
                + Add type
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <LinkButton href={editHref} variant="secondary">
              Edit
            </LinkButton>
            {!item.archivedAt && (
              <LinkButton href={`/items/new?from=${item.id}`} variant="secondary">
                Duplicate
              </LinkButton>
            )}
          </>
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
                            <Link href={withBack(`/boxes/${boxCode(h.box.id)}`, here)} className="text-brand-700">
                              {boxCode(h.box.id)}
                            </Link>{" "}
                            <Badge tone="amber">In transit</Badge>
                          </p>
                          <p className="text-sm text-gray-600">
                            {h.box.origin?.name} → {h.box.destination?.name}
                          </p>
                        </>
                      ) : (
                        <>
                          {h.box && (
                            <Link href={withBack(`/boxes/${boxCode(h.box.id)}`, here)} className="font-medium text-brand-700">
                              {boxCode(h.box.id)}
                            </Link>
                          )}
                          <p className="text-sm text-gray-600">In a box at {h.box?.location?.name}</p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xl font-semibold">{h.quantity}</span>
                      {(h.location || h.box?.status === "AT_LOCATION") && (
                        <Link
                          href={h.location ? `/locations/${h.location.id}/count?item=${item.id}` : `/boxes/${boxCode(h.box!.id)}/count?item=${item.id}`}
                          className="rounded-lg px-2 py-2 text-sm font-medium text-brand-700 active:bg-brand-50"
                        >
                          Adjust
                        </Link>
                      )}
                    </div>
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
