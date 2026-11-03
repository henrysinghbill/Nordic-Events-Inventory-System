import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { activeBoxes, activeLocations } from "@/server/queries";
import { ScanFlow } from "./scan-flow";

export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage() {
  await requireUser();
  const [boxes, locations] = await Promise.all([activeBoxes(), activeLocations()]);
  return (
    <>
      <PageHeader title="Scan" subtitle="Box label, DHL piece ID (JD…) or waybill" />
      <ScanFlow
        boxes={boxes.map((b) => ({
          id: b.id,
          code: boxCode(b.id),
          where: b.location ? b.location.name : `in transit to ${b.destination?.name}`,
        }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      />
    </>
  );
}
