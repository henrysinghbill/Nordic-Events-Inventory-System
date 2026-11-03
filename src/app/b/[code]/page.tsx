import { notFound, redirect } from "next/navigation";
import { parseBoxCode } from "@/lib/barcodes";
import { boxCode } from "@/lib/format";
import { requireUser } from "@/server/auth/session";

/**
 * Short address printed in QR labels: {APP_BASE_URL}/b/BOX-0047.
 * Opening it with the phone's normal camera lands here (after signing in).
 */
export default async function ShortBoxLink({ params }: PageProps<"/b/[code]">) {
  await requireUser();
  const id = parseBoxCode((await params).code);
  if (!id) notFound();
  redirect(`/boxes/${boxCode(id)}`);
}
