import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { activeLocations, eventDetail, lastShippedFrom, locationDetail } from "@/server/queries";
import { WrapUpForm } from "./wrap-up-form";

export const metadata: Metadata = { title: "Wrap up event" };

export default async function WrapUpPage({ params }: PageProps<"/events/[id]/wrap-up">) {
  await requireUser();
  const id = toId((await params).id);
  const event = id ? await eventDetail(id) : null;
  if (!event) notFound();
  if (event.wrappedUpAt) redirect(`/events/${event.id}`);

  const venueId = event.venueId;
  const atVenue = event.boxes.filter((b) => b.status === "AT_LOCATION" && b.locationId === venueId);
  const elsewhere = event.boxes.filter((b) => !atVenue.includes(b));
  const [locations, venue, cameFrom] = await Promise.all([
    activeLocations(),
    locationDetail(venueId),
    lastShippedFrom(
      atVenue.map((b) => b.id),
      venueId,
    ),
  ]);
  const destinations = locations.filter((l) => l.id !== venueId);
  const firstStorage = destinations.find((l) => l.type === "STORAGE")?.id ?? null;
  const usable = new Set(destinations.map((d) => d.id));

  return (
    <>
      <PageHeader
        back={{ href: `/events/${event.id}`, label: event.name }}
        title="Wrap up the event"
        subtitle={`Count what's left at ${event.venue.name}, then send the boxes on their way.`}
      />
      {elsewhere.length > 0 && (
        <Card className="mx-auto mb-4 max-w-2xl bg-gray-50 p-3 text-sm text-gray-700">
          Not at the venue, so not included here:{" "}
          {elsewhere.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              <Link href={`/boxes/${boxCode(b.id)}`} className="font-medium text-brand-700">
                {boxCode(b.id)}
              </Link>{" "}
              ({b.status === "IN_TRANSIT" ? `in transit to ${b.destination?.name}` : `at ${b.location?.name}`})
            </span>
          ))}
        </Card>
      )}
      <WrapUpForm
        eventId={event.id}
        eventName={event.name}
        venueName={event.venue.name}
        destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
        boxes={atVenue.map((b) => {
          const from = cameFrom.get(b.id);
          return {
            id: b.id,
            code: boxCode(b.id),
            description: b.description,
            defaultDestinationId: from && usable.has(from) ? from : firstStorage,
            items: b.holdings.map((h) => ({ itemId: h.item.id, name: h.item.name, photoKey: h.item.photos[0]?.key ?? null, recorded: h.quantity })),
          };
        })}
        loose={(venue?.loose ?? []).map((h) => ({
          itemId: h.item.id,
          name: h.item.name,
          photoKey: h.item.photos[0]?.key ?? null,
          recorded: h.quantity,
        }))}
      />
    </>
  );
}
