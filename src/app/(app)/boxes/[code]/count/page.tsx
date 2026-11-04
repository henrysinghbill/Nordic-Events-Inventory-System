import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CountForm } from "@/components/count-form";
import { PageHeader } from "@/components/ui";
import { parseBoxCode } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { boxDetail } from "@/server/queries";
import { countAction } from "../../../stock-actions";

export const metadata: Metadata = { title: "Count / adjust" };

export default async function CountBoxPage({ params, searchParams }: PageProps<"/boxes/[code]/count">) {
  await requireUser();
  const id = parseBoxCode((await params).code);
  if (!id) notFound();
  const code = boxCode(id);
  const box = await boxDetail(id);
  if (!box || box.deletedAt) notFound();
  if (box.status !== "AT_LOCATION" || box.holdings.length === 0) redirect(`/boxes/${code}`);
  const only = toId((await searchParams).item);
  const holdings = only ? box.holdings.filter((h) => h.item.id === only) : box.holdings;

  return (
    <>
      <PageHeader
        back={{ href: `/boxes/${code}`, label: code }}
        title={`Count ${code}`}
        subtitle="Enter what is actually in the box now."
      />
      <CountForm
        doneHref={`/boxes/${code}`}
        action={countAction.bind(null, { boxId: id })}
        rows={holdings.map((h) => ({
          itemId: h.item.id,
          name: h.item.name,
          photoKey: h.item.photos[0]?.key ?? null,
          recorded: h.quantity,
        }))}
      />
    </>
  );
}
