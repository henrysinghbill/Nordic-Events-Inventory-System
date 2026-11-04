import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CountForm } from "@/components/count-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { locationDetail } from "@/server/queries";
import { countAction } from "../../../stock-actions";

export const metadata: Metadata = { title: "Count / adjust" };

export default async function CountLoosePage({ params, searchParams }: PageProps<"/locations/[id]/count">) {
  await requireUser();
  const id = toId((await params).id);
  if (!id) notFound();
  const data = await locationDetail(id);
  if (!data) notFound();
  const only = toId((await searchParams).item);
  const loose = only ? data.loose.filter((h) => h.item.id === only) : data.loose;

  return (
    <>
      <PageHeader
        back={{ href: `/locations/${id}`, label: data.location.name }}
        title="Count loose stock"
        subtitle={`Enter what is actually loose at ${data.location.name} now (not in boxes).`}
      />
      {loose.length === 0 ? (
        <EmptyState>There&apos;s no loose stock here to count.</EmptyState>
      ) : (
        <CountForm
          doneHref={`/locations/${id}`}
          action={countAction.bind(null, { locationId: id })}
          rows={loose.map((h) => ({
            itemId: h.item.id,
            name: h.item.name,
            photoKey: h.item.photos[0]?.key ?? null,
            recorded: h.quantity,
          }))}
        />
      )}
    </>
  );
}
