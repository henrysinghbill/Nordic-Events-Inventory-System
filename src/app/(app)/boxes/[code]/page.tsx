import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HistoryList } from "@/components/history-list";
import { Photo } from "@/components/photo";
import { Badge, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { parseBoxCode, trackingUrl } from "@/lib/barcodes";
import { boxCode, plural } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { fmtDate, fmtDateTime } from "@/server/dates";
import { activeLocations, boxDetail, history } from "@/server/queries";
import { ArriveForm, BoxPhoto, DeleteBoxButton, DescriptionEditor, LinkBarcode } from "./box-client";

export async function generateMetadata({ params }: PageProps<"/boxes/[code]">): Promise<Metadata> {
  const id = parseBoxCode((await params).code);
  return { title: id ? boxCode(id) : "Box" };
}

const BARCODE_LABEL = { DHL_PIECE: "DHL piece ID", DHL_WAYBILL: "DHL waybill", OTHER: "Other barcode" } as const;

export default async function BoxPage({ params, searchParams }: PageProps<"/boxes/[code]">) {
  await requireUser();
  const raw = (await params).code;
  const id = parseBoxCode(raw);
  if (!id) notFound();
  const code = boxCode(id);
  if (raw !== code) redirect(`/boxes/${code}`);

  const [box, locations, entries] = await Promise.all([boxDetail(id), activeLocations(), history({ boxId: id }, 50)]);
  if (!box) notFound();
  const { packed } = await searchParams;

  const atLocation = box.status === "AT_LOCATION" && box.location;
  const pieces = box.holdings.reduce((s, h) => s + h.quantity, 0);
  const waybill = box.barcodes.find((b) => b.type === "DHL_WAYBILL");
  const backHref = box.location ? `/locations/${box.location.id}` : "/";

  if (box.deletedAt) {
    return (
      <>
        <PageHeader back={{ href: "/", label: "Home" }} title={code} subtitle={<Badge>Discarded {fmtDate(box.deletedAt)}</Badge>} />
        <p className="mb-4 text-gray-700">This box was discarded. It no longer appears in lists, but its history is kept.</p>
        <SectionTitle>History</SectionTitle>
        <HistoryList entries={entries} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: box.location?.name ?? "Home" }}
        title={code}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 pt-1">
            {atLocation ? (
              <>
                <Badge tone="green">At location</Badge>
                <Link href={`/locations/${box.location!.id}`} className="font-medium text-brand-700">
                  {box.location!.name}
                </Link>
              </>
            ) : (
              <>
                <Badge tone="amber">In transit</Badge>
                <span>
                  {box.origin?.name} → {box.destination?.name}
                </span>
              </>
            )}
          </span>
        }
      />

      {packed && (
        <Card className="mb-4 bg-green-50 p-4 ring-green-200">
          <p className="font-semibold text-green-900">Packed. Next (all optional, can also be done later):</p>
          <ul className="mt-1 list-inside list-disc text-green-900">
            <li>Take a photo of the packed box</li>
            <li>Link the DHL label, or print a QR label if it will sit in storage first</li>
          </ul>
        </Card>
      )}

      {box.event && !box.event.wrappedUpAt && (
        <p className="mb-4 rounded-xl bg-brand-50 p-3 text-brand-900 ring-1 ring-brand-200">
          Packed for{" "}
          <Link href={`/events/${box.event.id}`} className="font-semibold underline">
            {box.event.name}
          </Link>
        </p>
      )}

      {!atLocation && (
        <Card className="mb-4 space-y-3 p-4 ring-2 ring-amber-300">
          {box.dhlDeliveredAt ? (
            <p className="rounded-xl bg-green-50 p-3 font-medium text-green-900 ring-1 ring-green-200">
              DHL says this was delivered on {fmtDateTime(box.dhlDeliveredAt)}. Mark it as arrived once you&apos;ve found it.
            </p>
          ) : (
            box.dhlStatusText &&
            box.dhlCheckedAt && (
              <p className="text-sm text-gray-700">
                DHL: {box.dhlStatusText} <span className="text-gray-500">(checked {fmtDateTime(box.dhlCheckedAt)})</span>
              </p>
            )
          )}
          {waybill ? (
            <a
              href={trackingUrl(config().DHL_TRACKING_URL_TEMPLATE, waybill.value)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center rounded-xl bg-yellow-400 font-bold text-gray-900 active:bg-yellow-500"
            >
              Track with DHL ({waybill.value})
            </a>
          ) : (
            <p className="text-sm text-gray-600">No waybill linked, so there&apos;s no tracking link. Link the DHL label below.</p>
          )}
          <ArriveForm
            boxId={box.id}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            defaultLocationId={box.destinationId ?? undefined}
          />
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Card className="p-4">
            <DescriptionEditor boxId={box.id} description={box.description} />
          </Card>

          <div className="grid grid-cols-2 gap-2">
            {atLocation && (
              <>
                <LinkButton href={`/boxes/${code}/pack`}>{box.holdings.length ? "Pack more" : "Pack items"}</LinkButton>
                <LinkButton href={`/boxes/${code}/ship`}>Ship</LinkButton>
                {box.holdings.length > 0 && (
                  <>
                    <LinkButton href={`/boxes/${code}/unpack`} variant="secondary">
                      Unpack
                    </LinkButton>
                    <LinkButton href={`/boxes/${code}/count`} variant="secondary">
                      Count / adjust
                    </LinkButton>
                  </>
                )}
              </>
            )}
            <LinkButton href={`/print/labels?boxes=${box.id}`} variant="secondary">
              Print label
            </LinkButton>
          </div>

          <BoxPhoto boxId={box.id} code={code} photoKey={box.photos[0]?.key ?? null} />
        </div>

        <div>
          <SectionTitle>
            Contents <span className="font-normal text-gray-500">· {plural(pieces, "piece")}</span>
          </SectionTitle>
          {box.holdings.length === 0 ? (
            <EmptyState>This box is empty.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-gray-100">
                {box.holdings.map((h) => (
                  <li key={h.id}>
                    <Link href={`/items/${h.item.id}`} className="flex items-center gap-3 px-4 py-2 active:bg-gray-50">
                      <Photo photoKey={h.item.photos[0]?.key} alt="" className="h-14 w-14 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{h.item.name}</p>
                        <p className="truncate text-sm text-gray-500">
                          {h.item.companies.map((c) => c.company.name).join(", ")}
                        </p>
                      </div>
                      <span className="text-xl font-semibold">{h.quantity}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <SectionTitle>Barcodes</SectionTitle>
          <div className="space-y-2">
            <Card>
              <ul className="divide-y divide-gray-100">
                <li className="px-4 py-2">
                  <p className="text-sm text-gray-600">App QR label</p>
                  <p className="font-mono">{code}</p>
                </li>
                {box.barcodes.map((b) => (
                  <li key={b.id} className="px-4 py-2">
                    <p className="flex items-center gap-2 text-sm text-gray-600">
                      {BARCODE_LABEL[b.type]}
                      {b.id === waybill?.id && <Badge tone="brand">Current</Badge>}
                    </p>
                    <p className="font-mono break-all">{b.value}</p>
                    <p className="text-xs text-gray-500">Linked {fmtDateTime(b.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <LinkBarcode boxId={box.id} />
          </div>
        </div>
      </div>

      <SectionTitle>History</SectionTitle>
      <HistoryList entries={entries} />

      {box.holdings.length === 0 && (
        <div className="mt-6">
          <DeleteBoxButton boxId={box.id} code={code} afterHref={backHref} />
        </div>
      )}
    </>
  );
}
