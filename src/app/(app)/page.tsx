import { LocationCard } from "@/components/location-card";
import { EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { locationsOverview } from "@/server/queries";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const locations = await locationsOverview();

  return (
    <>
      <PageHeader
        title={`Hi, ${user.displayName}`}
        actions={
          <LinkButton href="/items/new" className="hidden md:inline-flex">
            + Add item
          </LinkButton>
        }
      />
      {denied && (
        <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
          That page is only for administrators.
        </p>
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
