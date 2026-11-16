"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/action-form";
import { useToast } from "@/components/toast";
import { Button, Card, cx } from "@/components/ui";
import { useRequestId, useServerAction } from "@/components/use-server-action";
import { plural } from "@/lib/format";
import { Row, RowFilter, StickyBar, useRowFilter, type LineRow } from "../../../boxes/[code]/lines-form";
import { packForEventAction } from "../../actions";

export type PackRow = LineRow & { start: number };
type BoxChoice = { id: number; code: string; label: string; forThisEvent: boolean };

/**
 * Pack a box for an event: quantities start at what's still needed for the
 * packing list (as far as there is stock here); other loose items start at 0.
 */
export function EventPackForm({
  eventId,
  locationId,
  boxes,
  listRows,
  otherRows,
}: {
  eventId: number;
  locationId: number;
  boxes: BoxChoice[];
  listRows: PackRow[];
  otherRows: PackRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const requestId = useRequestId();
  const all = [...listRows, ...otherRows];
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(all.map((r) => [r.itemId, String(r.start)])));
  const [boxId, setBoxId] = useState("");
  const [showOthers, setShowOthers] = useState(listRows.length === 0);
  // The items that are not on the packing list can be many, so they get a filter (text and type).
  const others = useRowFilter(otherRows);
  const { run, pending, error } = useServerAction((form: FormData) => packForEventAction(eventId, form));

  const n = (id: number) => Number.parseInt(qty[id] || "0", 10);
  const lines = all.map((r) => ({ itemId: r.itemId, quantity: n(r.itemId) })).filter((l) => l.quantity > 0);
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  const tooMany = all.some((r) => n(r.itemId) > r.available);
  const target = boxes.find((b) => String(b.id) === boxId)?.code ?? "a new box";

  async function submit() {
    const form = new FormData();
    form.set("requestId", requestId.current());
    form.set("locationId", String(locationId));
    form.set("boxId", boxId);
    form.set("lines", JSON.stringify(lines));
    const r = await run(form);
    if (r?.ok) {
      requestId.renew();
      toast("success", r.message ?? "Packed.");
      router.push(`/events/${eventId}`);
    }
  }

  const rowList = (rows: PackRow[]) => (
    <Card>
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <Row
            key={r.itemId}
            row={r}
            value={qty[r.itemId]}
            onChange={(v) => setQty((q) => ({ ...q, [r.itemId]: v }))}
            ticked
            onTick={() => {}}
            tickable={false}
          />
        ))}
      </ul>
    </Card>
  );

  return (
    <div className="space-y-3 pb-28">
      <Card className="p-4">
        <p className="mb-2 font-medium">Pack into</p>
        <div className="grid gap-2">
          {[{ id: 0, code: "", label: "A new box", forThisEvent: false }, ...boxes].map((b) => {
            const value = b.id ? String(b.id) : "";
            return (
              <label
                key={b.id}
                className={cx(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1",
                  boxId === value ? "bg-brand-50 ring-2 ring-brand-500" : "ring-gray-300",
                )}
              >
                <input type="radio" name="box" checked={boxId === value} onChange={() => setBoxId(value)} className="h-5 w-5 accent-brand-600" />
                <span className="flex-1">{b.label}</span>
                {b.forThisEvent && <span className="text-sm text-gray-500">already for this event</span>}
              </label>
            );
          })}
        </div>
      </Card>

      {listRows.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">From the packing list</h2>
          {rowList(listRows)}
        </>
      )}

      {otherRows.length > 0 &&
        (showOthers ? (
          <>
            <h2 className="pt-2 text-lg font-semibold">{listRows.length ? "Other items here" : "Items here"}</h2>
            <RowFilter filter={others} />
            {others.shown.length > 0 && rowList(others.shown)}
          </>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setShowOthers(true)}>
            Pack other items too ({plural(otherRows.length, "item")} here)
          </Button>
        ))}

      <StickyBar>
        {error && <FormError message={error} />}
        <Button className="min-h-14 w-full text-lg" disabled={pending || total === 0 || tooMany} onClick={submit}>
          {pending ? "Packing…" : total === 0 ? "Choose quantities to pack" : `Pack ${plural(total, "piece")} into ${target}`}
        </Button>
      </StickyBar>
    </div>
  );
}
