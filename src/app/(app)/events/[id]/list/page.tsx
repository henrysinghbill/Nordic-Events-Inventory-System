import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { eventDetail } from "@/server/queries";
import { PackingListEditor } from "./list-editor";

export const metadata: Metadata = { title: "Packing list" };

export default async function PackingListPage({ params }: PageProps<"/events/[id]/list">) {
  await requireUser();
  const id = toId((await params).id);
  const event = id ? await eventDetail(id) : null;
  if (!event) notFound();
  return (
    <>
      <PageHeader back={{ href: `/events/${event.id}`, label: event.name }} title="Packing list" subtitle="What needs to go to the event, and how many." />
      <PackingListEditor
        eventId={event.id}
        initial={event.lines.map((l) => ({
          itemId: l.itemId,
          name: l.item.name,
          photoKey: l.item.photos[0]?.key ?? null,
          quantity: String(l.quantity),
        }))}
      />
    </>
  );
}
