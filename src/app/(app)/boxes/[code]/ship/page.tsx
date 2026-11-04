import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { parseBoxCode } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeLocations } from "@/server/queries";
import { ShipForm } from "./ship-form";

export const metadata: Metadata = { title: "Ship box" };

export default async function ShipPage({ params }: PageProps<"/boxes/[code]/ship">) {
  await requireUser();
  const id = parseBoxCode((await params).code);
  if (!id) notFound();
  const code = boxCode(id);
  const box = await db.box.findUnique({
    where: { id },
    include: {
      location: true,
      event: true,
      barcodes: { where: { type: "DHL_WAYBILL" } },
      _count: { select: { holdings: true } },
    },
  });
  if (!box || box.deletedAt) notFound();
  if (box.status !== "AT_LOCATION" || !box.location) redirect(`/boxes/${code}`);
  const destinations = (await activeLocations()).filter((l) => l.id !== box.locationId);

  return (
    <>
      <PageHeader back={{ href: `/boxes/${code}`, label: code }} title={`Ship ${code}`} subtitle={`From ${box.location.name}`} />
      {box._count.holdings === 0 && (
        <p className="mx-auto mb-4 max-w-md rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">This box is empty.</p>
      )}
      {destinations.length === 0 ? (
        <EmptyState>There are no other locations to ship to. An administrator can add one.</EmptyState>
      ) : (
        <ShipForm
          boxId={id}
          code={code}
          hasWaybill={box.barcodes.length > 0}
          defaultDestinationId={box.event && !box.event.wrappedUpAt ? box.event.venueId : undefined}
          destinations={destinations.map((d) => ({ id: d.id, name: d.name, country: d.country }))}
        />
      )}
    </>
  );
}
