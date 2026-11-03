import Link from "next/link";
import { BoxIcon } from "@/components/icons";
import { LocationCard } from "@/components/location-card";
import { Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { trackingUrl } from "@/lib/barcodes";
import { boxCode, plural } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { boxesInTransit, locationsOverview } from "@/server/queries";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const [locations, moving] = await Promise.all([locationsOverview(), boxesInTransit()]);
  const template = config().DHL_TRACKING_URL_TEMPLATE;

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
