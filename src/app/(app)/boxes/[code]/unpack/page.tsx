import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { parseBoxCode } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { boxDetail } from "@/server/queries";
import { unpackAction } from "../../actions";
import { UnpackForm } from "../lines-form";

export const metadata: Metadata = { title: "Unpack box" };

export default async function UnpackPage({ params }: PageProps<"/boxes/[code]/unpack">) {
  await requireUser();
  const id = parseBoxCode((await params).code);
  if (!id) notFound();
  const code = boxCode(id);
  const box = await boxDetail(id);
  if (!box || box.deletedAt) notFound();
  if (box.status !== "AT_LOCATION" || !box.location || box.holdings.length === 0) redirect(`/boxes/${code}`);

  return (
    <>
      <PageHeader
        back={{ href: `/boxes/${code}`, label: code }}
        title={`Unpack ${code}`}
        subtitle={`Into the loose stock at ${box.location.name}. Untick or lower quantities to unpack only part.`}
      />
      <UnpackForm
        code={code}
        boxId={id}
        action={unpackAction.bind(null, id)}
        afterDiscardHref={`/locations/${box.location.id}`}
        rows={box.holdings.map((h) => ({
          itemId: h.item.id,
          name: h.item.name,
          photoKey: h.item.photos[0]?.key ?? null,
          available: h.quantity,
          companies: h.item.companies.map((c) => c.company.name).join(", "),
        }))}
      />
    </>
  );
}
