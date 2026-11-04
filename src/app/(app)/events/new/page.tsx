import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { activeLocations } from "@/server/queries";
import { NewEventForm } from "../event-form";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireUser();
  const venues = (await activeLocations()).map((l) => ({ id: l.id, name: l.name, type: l.type }));
  return (
    <>
      <PageHeader back={{ href: "/events", label: "Events" }} title="New event" />
      <NewEventForm venues={venues} />
    </>
  );
}
