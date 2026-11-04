import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { dayString } from "@/lib/days";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeLocations } from "@/server/queries";
import { EditEventForm } from "../../event-form";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: PageProps<"/events/[id]/edit">) {
  await requireUser();
  const id = toId((await params).id);
  const event = id ? await db.event.findUnique({ where: { id } }) : null;
  if (!event) notFound();
  const locations = await activeLocations();
  const venues = locations.map((l) => ({ id: l.id, name: l.name, type: l.type }));
  // Keep the current venue selectable even if it has since been archived.
  if (!venues.some((v) => v.id === event.venueId)) {
    const venue = await db.location.findUniqueOrThrow({ where: { id: event.venueId } });
    venues.push({ id: venue.id, name: `${venue.name} (archived)`, type: venue.type });
  }
  return (
    <>
      <PageHeader back={{ href: `/events/${event.id}`, label: event.name }} title="Edit event" />
      <EditEventForm
        venues={venues}
        event={{
          id: event.id,
          name: event.name,
          venueId: event.venueId,
          startDate: dayString(event.startDate),
          endDate: dayString(event.endDate),
          notes: event.notes,
        }}
      />
    </>
  );
}
