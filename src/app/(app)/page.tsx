import Link from "next/link";
import { AlertIcon, BoxIcon, CalendarIcon, CheckIcon, ChevronRightIcon, ImageIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { LocationCard } from "@/components/location-card";
import { Badge, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { trackingUrl } from "@/lib/barcodes";
import { eventPhase, formatDayRange, PHASE_LABEL, PHASE_TONE, todayIn } from "@/lib/days";
import { boxCode, plural } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { fmtDate, fmtDateTime } from "@/server/dates";
import { db } from "@/server/db";
import { lastDhlRun } from "@/server/dhl";
import { boxesInTransit, countMissingPhotos, locationsOverview, lowStockItems, openEvents } from "@/server/queries";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const { DHL_TRACKING_URL_TEMPLATE: template, DHL_API_KEY, APP_TIMEZONE } = config();
  const [locations, moving, lowStock, missingPhotos, events, dhlRun] = await Promise.all([
    locationsOverview(),
    boxesInTransit(),
    lowStockItems(),
    countMissingPhotos(),
    openEvents(),
    DHL_API_KEY ? lastDhlRun(db) : null,
  ]);
  const today = todayIn(APP_TIMEZONE);

  return (
    <>
      <PageHeader
        title={`Hi, ${user.displayName}`}
        actions={
          <>
            <LinkButton href="/boxes/new" variant="secondary">
              Pack a box
            </LinkButton>
            <LinkButton href="/items/new" className="hidden md:inline-flex">
              + Add item
            </LinkButton>
          </>
        }
      />
      {denied && (
        <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
          That page is only for administrators.
        </p>
      )}

      {(lowStock.length > 0 || missingPhotos > 0) && (
        <>
          <SectionTitle>Warnings</SectionTitle>
          <Card className="mb-2">
            <ul className="divide-y divide-gray-100">
              {lowStock.map((i) => (
                <li key={i.id}>
                  <Link href={`/items/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-gray-50">
                    <Photo photoKey={i.photoKey} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.name}</span>
                      <span className="flex items-center gap-1 text-sm text-red-700">
                        <AlertIcon size={14} /> Low stock: {i.total} left (warning below {i.threshold})
                      </span>
                    </span>
                    <ChevronRightIcon className="shrink-0 text-gray-400" />
                  </Link>
                </li>
              ))}
              {missingPhotos > 0 && (
                <li>
                  <Link href="/search?missingPhoto=1" className="flex items-center gap-3 px-4 py-2.5 active:bg-gray-50">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                      <ImageIcon size={22} />
                    </span>
                    <span className="flex-1 font-medium">{plural(missingPhotos, "item")} without a photo</span>
                    <ChevronRightIcon className="shrink-0 text-gray-400" />
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        </>
      )}

      <SectionTitle
        actions={
          <Link href="/events" className="font-medium text-brand-700">
            All events
          </Link>
        }
      >
        Events
      </SectionTitle>
      {events.length === 0 ? (
        <Card className="mb-2 flex flex-wrap items-center justify-between gap-2 p-4 text-gray-600">
          No upcoming events.
          <Link href="/events/new" className="font-medium text-brand-700">
            + New event
          </Link>
        </Card>
      ) : (
        <Card className="mb-2">
          <ul className="divide-y divide-gray-100">
            {events.map((e) => {
              const phase = eventPhase(e, today);
              return (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                    <CalendarIcon className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{e.name}</span>
                        <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
                      </span>
                      <span className="block text-sm text-gray-600">
                        {e.venue.name} · {formatDayRange(e.startDate, e.endDate)} · {plural(e._count.boxes, "box", "boxes")}
                      </span>
                    </span>
                    <ChevronRightIcon className="shrink-0 text-gray-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {moving.length > 0 && (
        <>
          <SectionTitle>
            In transit <span className="font-normal text-gray-500">· {plural(moving.length, "box", "boxes")}</span>
          </SectionTitle>
          <Card className="mb-2">
            <ul className="divide-y divide-gray-100">
              {moving.map((b) => {
                const waybill = b.barcodes[0]?.value;
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <Link href={`/boxes/${boxCode(b.id)}`} className="flex min-w-0 flex-1 items-center gap-2">
                      <BoxIcon className="shrink-0 text-amber-600" size={20} />
                      <span className="min-w-0">
                        <span className="block font-semibold">{boxCode(b.id)}</span>
                        <span className="block text-sm text-gray-600">
                          {b.origin?.name} → {b.destination?.name}
                        </span>
                        {b.dhlDeliveredAt && (
                          <span className="flex items-center gap-1 text-sm font-medium text-green-800">
                            <CheckIcon size={14} /> DHL says delivered {fmtDate(b.dhlDeliveredAt)}: mark as arrived
                          </span>
                        )}
                      </span>
                    </Link>
                    {waybill ? (
                      <a
                        href={trackingUrl(template, waybill)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-yellow-400 px-3 py-2 text-sm font-bold text-gray-900 active:bg-yellow-500"
                      >
                        Track with DHL
                      </a>
                    ) : (
                      <span className="text-sm text-gray-500">No waybill</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          {dhlRun && (
            <p className={dhlRun.error ? "mb-2 text-sm text-amber-800" : "mb-2 text-sm text-gray-500"}>
              {dhlRun.error
                ? `Automatic DHL tracking couldn't check at ${fmtDateTime(new Date(dhlRun.at))}: ${dhlRun.error}. The tracking links still work.`
                : `DHL tracking last checked ${fmtDateTime(new Date(dhlRun.at))}.`}
            </p>
          )}
        </>
      )}

      <SectionTitle>Locations</SectionTitle>
      {locations.length === 0 ? (
        <EmptyState>No locations yet. An administrator can add them under More → Locations.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <LocationCard key={loc.id} loc={loc} />
          ))}
        </div>
      )}
    </>
  );
}
