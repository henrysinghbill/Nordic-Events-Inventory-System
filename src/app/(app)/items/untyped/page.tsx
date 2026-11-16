import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { itemTypes, untypedItems } from "@/server/queries";
import { UntypedAssigner } from "./untyped-assigner";

export const metadata: Metadata = { title: "Items without a type" };

/**
 * Give types to many items quickly: choose a type, tick the items that are
 * one, save, and repeat for the next type. Meant for items that were added
 * before types existed, or through bulk entry without a type.
 */
export default async function UntypedItemsPage() {
  await requireUser();
  const [items, types] = await Promise.all([untypedItems(), itemTypes()]);
  return (
    <>
      <PageHeader
        back={{ href: "/items", label: "Items" }}
        title="Items without a type"
        subtitle={
          items.length > 0
            ? "Choose a type, tick the items that belong to it, and save. Then do the same for the next type."
            : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState>
          Every item has a type.{" "}
          <Link href="/items" className="font-medium text-brand-700">
            Back to Items
          </Link>
        </EmptyState>
      ) : (
        <UntypedAssigner items={items} types={types.map((t) => ({ id: t.id, name: t.name }))} />
      )}
    </>
  );
}
