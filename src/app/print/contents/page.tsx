import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { formatDayRange } from "@/lib/days";
import { boxCode, plural } from "@/lib/format";
import { idList, toId } from "@/lib/params";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { fmtDateTime } from "@/server/dates";
import { db } from "@/server/db";
import { PrintButton } from "../labels/print-button";

export const metadata: Metadata = { title: "Contents sheet" };

/**
 * Printable A4 contents sheets: one page per box, listing everything in it
 * (to put inside the box, or to hand over for customs).
 *   ?boxes=7,8   — these boxes
 *   ?event=3     — an event's packing list summary, then a sheet for each of its boxes
 */
export default async function ContentsPage({ searchParams }: PageProps<"/print/contents">) {
  const user = await requireUser();
  const sp = await searchParams;
  const eventId = toId(sp.event);

  const event = eventId
    ? await db.event.findUnique({
        where: { id: eventId },
        include: { venue: true, lines: { include: { item: true }, orderBy: { item: { name: "asc" } } } },
      })
    : null;
  const ids = event
    ? (await db.box.findMany({ where: { eventId: event.id, deletedAt: null }, select: { id: true } })).map((b) => b.id)
    : idList(sp.boxes);

  const boxes = await db.box.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: {
      location: true,
      origin: true,
      destination: true,
      event: { include: { venue: true } },
      holdings: {
        include: { item: { include: { companies: { include: { company: true }, orderBy: { company: { name: "asc" } } } } } },
        orderBy: { item: { name: "asc" } },
      },
    },
    orderBy: { id: "asc" },
  });

  const base = config().APP_BASE_URL;
  const printed = `Printed ${fmtDateTime(new Date())} by ${user.displayName}`;
  const sheets = await Promise.all(
    boxes.map(async (b) => ({
      box: b,
      code: boxCode(b.id),
      svg: await QRCode.toString(`${base}/b/${boxCode(b.id)}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
    })),
  );

  // Packing list summary for an event: needed vs. packed, and in which boxes.
  const inBoxes = new Map<number, { code: string; qty: number }[]>();
  for (const b of boxes) {
    for (const h of b.holdings) inBoxes.set(h.itemId, [...(inBoxes.get(h.itemId) ?? []), { code: boxCode(b.id), qty: h.quantity }]);
  }

  const backHref = event ? `/events/${event.id}` : boxes.length === 1 ? `/boxes/${boxCode(boxes[0].id)}` : "/";

  return (
    <>
      <style>{`
        @page { size: 210mm 297mm; margin: 14mm; }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
          /* New page before every sheet except the first (no blank page at the end). */
          .contents-sheet + .contents-sheet { break-before: page; }
        }
      `}</style>

      <div className="no-print mx-auto max-w-3xl space-y-3 p-4">
        <Link href={backHref} className="font-medium text-brand-700">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{event ? `Packing list – ${event.name}` : "Contents sheet"}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <PrintButton />
          <span className="text-sm text-gray-600">
            {event ? `A summary page, then one page per box (${boxes.length}).` : "One A4 page per box."}
          </span>
        </div>
        {!event && boxes.length === 0 && <p>No boxes selected.</p>}
      </div>

      <div className="space-y-6 pb-8 print:space-y-0 print:pb-0">
        {event && (
          <Sheet>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-600">Packing list</p>
                <h2 className="text-3xl font-black">{event.name}</h2>
                <p className="mt-1 text-lg">
                  {event.venue.name} · {formatDayRange(event.startDate, event.endDate)}
                </p>
              </div>
              <p className="text-right text-sm text-gray-600">{printed}</p>
            </div>
            {event.lines.length === 0 ? (
              <p className="mt-6">This event has no packing list.</p>
            ) : (
              <table className="mt-6 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="py-1.5 pr-2">Item</th>
                    <th className="py-1.5 pr-2 text-right">Needed</th>
                    <th className="py-1.5 pr-2 text-right">Packed</th>
                    <th className="py-1.5">In boxes</th>
                    <th className="w-10 py-1.5 text-center">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {event.lines.map((l) => {
                    const where = inBoxes.get(l.itemId) ?? [];
                    const packed = where.reduce((s, w) => s + w.qty, 0);
                    return (
                      <tr key={l.itemId} className="break-inside-avoid border-b border-gray-300 align-top">
                        <td className="py-1.5 pr-2 font-medium">{l.item.name}</td>
                        <td className="py-1.5 pr-2 text-right">{l.quantity}</td>
                        <td className={packed < l.quantity ? "py-1.5 pr-2 text-right font-bold" : "py-1.5 pr-2 text-right"}>{packed}</td>
                        <td className="py-1.5 text-sm">{where.map((w) => `${w.code} (${w.qty})`).join(", ") || "–"}</td>
                        <td className="py-1.5 text-center">☐</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-4 text-sm text-gray-700">
              {plural(boxes.length, "box", "boxes")}: {boxes.map((b) => boxCode(b.id)).join(", ") || "none yet"}
            </p>
          </Sheet>
        )}

        {sheets.map(({ box, code, svg }) => {
          const pieces = box.holdings.reduce((s, h) => s + h.quantity, 0);
          const where = box.location
            ? `At ${box.location.name}`
            : `In transit: ${box.origin?.name ?? "?"} → ${box.destination?.name ?? "?"}`;
          return (
            <Sheet key={box.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-gray-600">Contents of</p>
                  <h2 className="text-5xl leading-none font-black tracking-tight">{code}</h2>
                  {box.description && <p className="mt-2 text-lg">{box.description}</p>}
                  <p className="mt-2">{where}</p>
                  {box.event && (
                    <p>
                      For {box.event.name} ({box.event.venue.name}, {formatDayRange(box.event.startDate, box.event.endDate)})
                    </p>
                  )}
                </div>
                <div className="w-[28mm] shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
              </div>

              {box.holdings.length === 0 ? (
                <p className="mt-6">This box is empty.</p>
              ) : (
                <table className="mt-6 w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b-2 border-black">
                      <th className="w-8 py-1.5 pr-2">#</th>
                      <th className="py-1.5 pr-2">Item</th>
                      <th className="py-1.5 pr-2">Company</th>
                      <th className="py-1.5 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {box.holdings.map((h, i) => (
                      <tr key={h.id} className="break-inside-avoid border-b border-gray-300 align-top">
                        <td className="py-1.5 pr-2 text-gray-600">{i + 1}</td>
                        <td className="py-1.5 pr-2 font-medium">{h.item.name}</td>
                        <td className="py-1.5 pr-2 text-sm">{h.item.companies.map((c) => c.company.name).join(", ")}</td>
                        <td className="py-1.5 text-right text-lg font-semibold">{h.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-black">
                      <td />
                      <td className="py-1.5 font-semibold" colSpan={2}>
                        Total: {plural(box.holdings.length, "item")}
                      </td>
                      <td className="py-1.5 text-right text-lg font-bold">{pieces}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <p className="mt-6 text-sm text-gray-600">{printed}. Scan the QR code to see the latest contents.</p>
            </Sheet>
          );
        })}
      </div>
    </>
  );
}

/** One A4 page: a white sheet on screen, a page of its own when printed. */
function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <section className="contents-sheet mx-auto w-[210mm] max-w-full bg-white p-[14mm] text-black shadow print:w-auto print:p-0 print:shadow-none">
      {children}
    </section>
  );
}
