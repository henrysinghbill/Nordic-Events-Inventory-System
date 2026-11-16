import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { backLink } from "@/server/back";
import { db } from "@/server/db";
import { activeLocations } from "@/server/queries";
import { NewBoxForm } from "./new-box-form";

export const metadata: Metadata = { title: "New box" };

export default async function NewBoxPage({ searchParams }: PageProps<"/boxes/new">) {
  await requireUser();
  const sp = await searchParams;
  const [locations, emptyBoxes, back] = await Promise.all([
    activeLocations(),
    db.box.findMany({
      where: { deletedAt: null, status: "AT_LOCATION", holdings: { none: {} } },
      orderBy: { id: "desc" },
    }),
    backLink(sp.back, { href: "/boxes", label: "Boxes" }),
  ]);
  const requested = toId(sp.location);

  return (
    <>
      <PageHeader back={back} title="Pack a box" />
      {locations.length === 0 ? (
        <EmptyState>An administrator needs to add a location first.</EmptyState>
      ) : (
        <NewBoxForm
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          defaultLocationId={locations.find((l) => l.id === requested)?.id}
          emptyBoxes={emptyBoxes.map((b) => ({ code: boxCode(b.id), locationId: b.locationId!, description: b.description }))}
        />
      )}
    </>
  );
}
