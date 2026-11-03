import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Card, cx } from "@/components/ui";
import { boxCode } from "@/lib/format";
import { toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { db } from "@/server/db";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print labels" };

type Layout = "single" | "a4";

/** Accepts ?boxes=1,2,3 or ?boxes=1&boxes=2 */
function idList(v: string | string[] | undefined): number[] {
  const parts = (Array.isArray(v) ? v : [v ?? ""]).flatMap((s) => s.split(","));
  return [...new Set(parts.map((p) => toId(p.trim())).filter((n): n is number => Boolean(n)))];
}

export default async function LabelsPage({ searchParams }: PageProps<"/print/labels">) {
  await requireUser();
  const sp = await searchParams;
  const layout: Layout = sp.layout === "a4" ? "a4" : "single";
  const locationId = toId(sp.location);
  const requested = idList(sp.boxes);

  const locationBoxes = locationId
    ? await db.box.findMany({ where: { locationId, deletedAt: null }, orderBy: { id: "asc" } })
    : [];
  const ids = requested.length ? requested : locationBoxes.map((b) => b.id);

  const boxes = await db.box.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: {
      location: true,
      destination: true,
      holdings: { include: { item: { include: { companies: { include: { company: true } } } } } },
    },
    orderBy: { id: "asc" },
  });

  const base = config().APP_BASE_URL;
  const labels = await Promise.all(
    boxes.map(async (b) => {
      const code = boxCode(b.id);
      const companies = [
        ...new Set(b.holdings.flatMap((h) => h.item.companies.map((c) => c.company.name))),
      ].sort();
      return {
        code,
        where: b.location ? b.location.name : `In transit to ${b.destination?.name}`,
        companies,
        description: b.description,
        svg: await QRCode.toString(`${base}/b/${code}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
      };
    }),
  );

  const query = (l: Layout) => {
    const p = new URLSearchParams();
    if (locationId) p.set("location", String(locationId));
    if (requested.length) p.set("boxes", requested.join(","));
    p.set("layout", l);
    return `?${p}`;
  };

  return (
    <>
      <style>{`
        @page { size: ${layout === "a4" ? "210mm 297mm" : "105mm 148mm"}; margin: 0; }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto max-w-3xl space-y-3 p-4">
        <Link href={boxes.length === 1 ? `/boxes/${labels[0].code}` : locationId ? `/locations/${locationId}` : "/"} className="font-medium text-brand-700">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">Print labels</h1>
        <div className="flex flex-wrap gap-2">
          {(["single", "a4"] as const).map((l) => (
            <Link
              key={l}
              href={query(l)}
              className={cx(
                "rounded-xl px-4 py-3 font-semibold ring-1",
                layout === l ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-gray-300",
              )}
            >
              {l === "single" ? "Sticker / A6 (one per page)" : "A4 sheet (8 per page)"}
            </Link>
          ))}
          <PrintButton />
        </div>

        {locationId && locationBoxes.length > 0 && (
          <Card className="p-4">
            <form className="space-y-2">
              <input type="hidden" name="location" value={locationId} />
              <input type="hidden" name="layout" value={layout} />
              <p className="font-medium">Boxes to print</p>
              <div className="flex flex-wrap gap-3">
                {locationBoxes.map((b) => (
                  <label key={b.id} className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" name="boxes" value={b.id} defaultChecked={ids.includes(b.id)} className="h-5 w-5 accent-brand-600" />
                    {boxCode(b.id)}
                  </label>
                ))}
              </div>
              <button type="submit" className="rounded-xl bg-white px-4 py-2 font-semibold ring-1 ring-gray-300">
                Update
              </button>
            </form>
          </Card>
        )}
        {labels.length === 0 && <p>No boxes selected.</p>}
        <p className="text-sm text-gray-600">
          Tip: in the print dialog, set margins to “None” and scale to 100%. The QR code opens the box in this app.
        </p>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        {layout === "a4" ? (
          chunk(labels, 8).map((page, i) => (
            <div
              key={i}
              className={cx("mx-auto grid grid-cols-2 grid-rows-4 bg-white", i > 0 && "print:break-before-page")}
              style={{ width: "210mm", height: "297mm" }}
            >
              {page.map((l) => (
                <Label key={l.code} label={l} width="105mm" height="74.25mm" compact />
              ))}
            </div>
          ))
        ) : (
          labels.map((l, i) => (
            <div key={l.code} className={cx("mx-auto mb-4 bg-white shadow print:mb-0 print:shadow-none", i > 0 && "print:break-before-page")} style={{ width: "105mm", height: "148mm" }}>
              <Label label={l} width="105mm" height="148mm" />
            </div>
          ))
        )}
      </div>
    </>
  );
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function Label({
  label,
  width,
  height,
  compact = false,
}: {
  label: { code: string; where: string; companies: string[]; description: string | null; svg: string };
  width: string;
  height: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cx("flex overflow-hidden border border-dashed border-gray-300 text-black print:border-gray-200", compact ? "flex-row items-center gap-[4mm] p-[5mm]" : "flex-col items-center p-[8mm] text-center")}
      style={{ width, height }}
    >
      <div className="shrink-0" style={{ width: compact ? "42mm" : "70mm" }} dangerouslySetInnerHTML={{ __html: label.svg }} />
      <div className={cx("min-w-0", compact ? "" : "mt-[5mm]")}>
        <p className="leading-none font-black tracking-tight" style={{ fontSize: compact ? "10mm" : "15mm" }}>
          {label.code}
        </p>
        <p className="mt-[2mm] font-semibold" style={{ fontSize: compact ? "3.6mm" : "5mm" }}>
          {label.where}
        </p>
        {label.companies.length > 0 && (
          <p className="mt-[1.5mm]" style={{ fontSize: compact ? "3.2mm" : "4.2mm" }}>
            {label.companies.join(" · ")}
          </p>
        )}
        {label.description && (
          <p className="mt-[1.5mm] text-gray-700" style={{ fontSize: compact ? "3mm" : "3.8mm" }}>
            {label.description}
          </p>
        )}
      </div>
    </div>
  );
}
