import type { Metadata } from "next";
import { LocationCard } from "@/components/location-card";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { locationsOverview } from "@/server/queries";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  const user = await requireUser();
  const locations = await locationsOverview();
  return (
    <>
      <PageHeader
        title="Locations"
        actions={
          user.role === "ADMIN" && (
            <LinkButton href="/admin/locations" variant="secondary">
              Manage
            </LinkButton>
          )
        }
      />
      {locations.length === 0 ? (
        <EmptyState>No locations yet.</EmptyState>
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
