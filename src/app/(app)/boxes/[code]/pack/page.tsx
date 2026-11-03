import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { parseBoxCode } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { locationDetail } from "@/server/queries";
import { packAction } from "../../actions";
import { PackForm } from "../lines-form";

export const metadata: Metadata = { title: "Pack box" };

export default async function PackPage({ params }: PageProps<"/boxes/[code]/pack">) {
  await requireUser();
  const id = parseBoxCode((await params).code);
  if (!id) notFound();
  const code = boxCode(id);
  const box = await db.box.findUnique({ where: { id }, include: { location: true } });
  if (!box || box.deletedAt) notFound();
  if (box.status !== "AT_LOCATION" || !box.location) redirect(`/boxes/${code}`);
  const data = await locationDetail(box.location.id);

  return (
    <>
      <PageHeader back={{ href: `/boxes/${code}`, label: code }} title={`Pack ${code}`} subtitle={`From the loose stock at ${box.location.name}`} />
      <PackForm
        code={code}
        action={packAction.bind(null, id)}
        rows={(data?.loose ?? []).map((h) => ({
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
