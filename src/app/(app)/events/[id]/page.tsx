import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoryList } from "@/components/history-list";
import { AlertIcon, BoxIcon, CheckIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { Badge, Card, cx, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { trackingUrl } from "@/lib/barcodes";
import { eventPhase, formatDayRange, PHASE_LABEL, PHASE_TONE, todayIn } from "@/lib/days";
import { boxCode, plural } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { db } from "@/server/db";
import { fmtDate } from "@/server/dates";
import { activeBoxes, eventDetail, history } from "@/server/queries";
import { AddBoxForm, BulkMoveButton, RemoveBoxButton } from "./event-client";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const id = toId((await params).id);
  const event = id ? await db.event.findUnique({ where: { id }, select: { name: true } }) : null;
  return { title: event?.name ?? "Event" };
}

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const [event, entries, allBoxes] = await Promise.all([eventDetail(id), history({ eventId: id }, 50), activeBoxes()]);
  if (!event) notFound();
  const { APP_TIMEZONE, DHL_TRACKING_URL_TEMPLATE } = config();
  const phase = eventPhase(event, todayIn(APP_TIMEZONE));
  const open = phase !== "wrapped";
  const venue = event.venue;

  // Packing progress: what's packed in the event's boxes vs. the list.
  const packed = new Map<number, number>();
  for (const b of event.boxes) for (const h of b.holdings) packed.set(h.item.id, (packed.get(h.item.id) ?? 0) + h.quantity);
  const listIds = new Set(event.lines.map((l) => l.itemId));
  const extras = [...new Map(event.boxes.flatMap((b) => b.holdings.filter((h) => !listIds.has(h.item.id)).map((h) => [h.item.id, h.item]))).values()];
  const linesDone = event.lines.filter((l) => (packed.get(l.itemId) ?? 0) >= l.quantity).length;

  const toShip = event.boxes.filter((b) => b.status === "AT_LOCATION" && b.locationId !== venue.id);
  const onTheWay = event.boxes.filter((b) => b.status === "IN_TRANSIT" && b.destinationId === venue.id);
  const atVenue = event.boxes.filter((b) => b.status === "AT_LOCATION" && b.locationId === venue.id);
  const codes = (boxes: { id: number }[]) => boxes.map((b) => boxCode(b.id)).join(", ");

  // Boxes that could be added: not in this event and not packed for another open event.
  const openEventIds = new Set(
    (await db.event.findMany({ where: { wrappedUpAt: null }, select: { id: true } })).map((e) => e.id),
  );
  const addable = allBoxes
    .filter((b) => b.eventId !== event.id && !(b.eventId && openEventIds.has(b.eventId)))
    .map((b) => ({
      id: b.id,
      label: `${boxCode(b.id)}${b.description ? ` – ${b.description}` : ""}`,
      group: b.location ? b.location.name : `In transit to ${b.destination?.name}`,
    }));

  return (
    <>
      <PageHeader
        back={{ href: "/events", label: "Events" }}
        title={event.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
            <Link href={`/locations/${venue.id}`} className="font-medium text-brand-700">
              {venue.name}
            </Link>
            <span>· {formatDayRange(event.startDate, event.endDate)}</span>
          </span>
        }
        actions={
          <LinkButton href={`/events/${event.id}/edit`} variant="secondary">
            Edit
          </LinkButton>
        }
      />

      {event.notes && <Card className="mb-4 p-4 whitespace-pre-line text-gray-800">{event.notes}</Card>}

      {open ? (
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <LinkButton href={`/events/${event.id}/pack`} className="min-h-14 text-lg">
            Pack a box for this event
          </LinkButton>
          {toShip.length > 0 && (
            <BulkMoveButton
              eventId={event.id}
              kind="ship"
              label={`Ship ${plural(toShip.length, "box", "boxes")} to ${venue.name}`}
              question={`Ship ${plural(toShip.length, "box", "boxes")} to ${venue.name}?\n${codes(toShip)}\n\nYou can scan their DHL labels afterwards on each box.`}
            />
          )}
          {onTheWay.length > 0 && (
            <BulkMoveButton
              eventId={event.id}
              kind="arrive"
              label={`Mark ${plural(onTheWay.length, "box", "boxes")} arrived`}
              question={`Mark ${plural(onTheWay.length, "box", "boxes")} as arrived at ${venue.name}?\n${codes(onTheWay)}`}
            />
          )}
          {(atVenue.length > 0 || phase === "ended") && (
            <LinkButton
              href={`/events/${event.id}/wrap-up`}
              variant={phase === "ended" ? "primary" : "secondary"}
              className="min-h-14 text-lg"
            >
              Wrap up after the event
            </LinkButton>
          )}
        </div>
      ) : (
        <Card className="mb-2 bg-gray-50 p-4 text-gray-700">
          Wrapped up on {fmtDate(event.wrappedUpAt!)}. See the history below for what was counted and where the boxes went.
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle
            actions={
              open && (
                <Link href={`/events/${event.id}/list`} className="font-medium text-brand-700">
                  {event.lines.length ? "Edit list" : "Add items"}
                </Link>
              )
            }
          >
            Packing list
            {open && event.lines.length > 0 && (
              <span className="font-normal text-gray-500">
                {" "}
                · {linesDone} of {event.lines.length} ready
              </span>
            )}
          </SectionTitle>
          {event.lines.length === 0 ? (
            <EmptyState>
              No packing list yet.{" "}
              <Link href={`/events/${event.id}/list`} className="font-medium text-brand-700">
                Add the items and quantities you need
              </Link>
              , and &ldquo;Pack a box&rdquo; will fill them in for you.
            </EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-gray-100">
                {event.lines.map((l) => {
                  const have = packed.get(l.itemId) ?? 0;
                  const done = have >= l.quantity;
                  return (
                    <li key={l.itemId}>
                      <Link href={`/items/${l.itemId}`} className="flex items-center gap-3 px-4 py-2 active:bg-gray-50">
                        <Photo photoKey={l.item.photos[0]?.key} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
                        <span className="min-w-0 flex-1 font-medium">{l.item.name}</span>
                        {!open ? (
                          <span className="text-lg font-semibold">{l.quantity}</span>
                        ) : (
                        <span
                          className={cx(
                            "flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap",
                            done ? "bg-green-100 text-green-800" : have > 0 ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-700",
                          )}
                        >
                          {done && <CheckIcon size={16} />}
                          {have} / {l.quantity}
                        </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {open && extras.length > 0 && (
            <p className="mt-2 text-sm text-gray-600">Also packed (not on the list): {extras.map((i) => i.name).join(", ")}</p>
          )}
        </div>

        <div>
          <SectionTitle>
            Boxes <span className="font-normal text-gray-500">· {event.boxes.length}</span>
          </SectionTitle>
          {event.boxes.length === 0 ? (
            <EmptyState>No boxes yet. Use &ldquo;Pack a box for this event&rdquo;, or add a box that&apos;s already packed.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-gray-100">
                {event.boxes.map((b) => {
                  const pieces = b.holdings.reduce((s, h) => s + h.quantity, 0);
                  const waybill = b.barcodes[0]?.value;
                  return (
                    <li key={b.id} className="flex items-start gap-1 px-4 py-3">
                      <Link href={`/boxes/${boxCode(b.id)}`} className="flex min-w-0 flex-1 gap-3">
                        <BoxIcon className={cx("mt-0.5 shrink-0", b.status === "IN_TRANSIT" ? "text-amber-600" : "text-brand-600")} />
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            {boxCode(b.id)}
                            {b.description && <span className="font-normal text-gray-600"> – {b.description}</span>}
                          </span>
                          <span className="block text-sm text-gray-600">
                            {b.status === "IN_TRANSIT"
                              ? `In transit: ${b.origin?.name} → ${b.destination?.name}`
                              : b.locationId === venue.id
                                ? `At the venue`
                                : `At ${b.location?.name}`}{" "}
                            · {plural(pieces, "piece")}
                          </span>
                          {b.holdings.length > 0 && (
                            <span className="block truncate text-sm text-gray-500">
                              {b.holdings.map((h) => `${h.quantity} × ${h.item.name}`).join(", ")}
                            </span>
                          )}
                          {b.dhlDeliveredAt && (
                            <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-green-800">
                              <CheckIcon size={14} /> DHL says delivered {fmtDate(b.dhlDeliveredAt)}
                            </span>
                          )}
                          {b.status === "IN_TRANSIT" && !waybill && (
                            <span className="mt-1 flex items-center gap-1 text-sm text-amber-800">
                              <AlertIcon size={14} /> No DHL label linked yet
                            </span>
                          )}
                        </span>
                      </Link>
                      {b.status === "IN_TRANSIT" && waybill && (
                        <a
                          href={trackingUrl(DHL_TRACKING_URL_TEMPLATE, waybill)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-lg bg-yellow-400 px-2.5 py-1.5 text-sm font-bold text-gray-900"
                        >
                          Track
                        </a>
                      )}
                      {open && <RemoveBoxButton eventId={event.id} boxId={b.id} code={boxCode(b.id)} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {open && (
            <div className="mt-2">
              <AddBoxForm eventId={event.id} boxes={addable} />
            </div>
          )}
        </div>
      </div>

      <SectionTitle>History</SectionTitle>
      <HistoryList entries={entries} />
    </>
  );
}
