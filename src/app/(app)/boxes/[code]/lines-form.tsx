"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormError } from "@/components/action-form";
import { QuantityInput } from "@/components/form-controls";
import { Photo } from "@/components/photo";
import { useToast } from "@/components/toast";
import { Button, Card, cx, EmptyState, inputClass } from "@/components/ui";
import { useRequestId, useServerAction } from "@/components/use-server-action";
import type { ActionResult } from "@/lib/action-result";
import { deleteBoxAction } from "../actions";

export type LineRow = {
  itemId: number;
  name: string;
  photoKey: string | null;
  available: number;
  companies: string;
  /** Replaces the "N available · companies" line (e.g. "Need 50 · 20 packed · 80 here"). */
  hint?: string;
};

/**
 * A list of items with a quantity for each — used for packing (start at 0)
 * and unpacking (start at the full quantity, all ticked).
 */
function useLines(rows: LineRow[], startFull: boolean) {
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, startFull ? String(r.available) : "0"])),
  );
  // Every row starts included; packing starts each quantity at 0, unpacking at the full amount.
  const [ticked, setTicked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, true])),
  );
  const lines = rows
    .map((r) => ({ itemId: r.itemId, quantity: ticked[r.itemId] ? Number.parseInt(qty[r.itemId] || "0", 10) : 0 }))
    .filter((l) => l.quantity > 0);
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  const tooMany = rows.filter((r) => ticked[r.itemId] && Number.parseInt(qty[r.itemId] || "0", 10) > r.available);
  return { qty, setQty, ticked, setTicked, lines, total, tooMany };
}

export function Row({
  row,
  value,
  onChange,
  ticked,
  onTick,
  tickable,
}: {
  row: LineRow;
  value: string;
  onChange: (v: string) => void;
  ticked: boolean;
  onTick: (v: boolean) => void;
  tickable: boolean;
}) {
  const n = Number.parseInt(value || "0", 10);
  return (
    <li className={cx("space-y-2 px-4 py-3", ticked && n > 0 && "bg-brand-50")}>
      <div className="flex items-center gap-3">
        {tickable && (
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => onTick(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-brand-600"
            aria-label={`Include ${row.name}`}
          />
        )}
        <Photo photoKey={row.photoKey} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{row.name}</p>
          <p className="text-sm text-gray-600">
            {row.hint ?? `${row.available} available${row.companies ? ` · ${row.companies}` : ""}`}
          </p>
        </div>
      </div>
      {ticked && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <QuantityInput id={`q-${row.itemId}`} value={value} onChange={onChange} min={0} />
          </div>
          <Button variant="secondary" onClick={() => onChange(String(row.available))}>
            All
          </Button>
        </div>
      )}
      {n > row.available && <p className="text-sm font-medium text-red-700">Only {row.available} available.</p>}
    </li>
  );
}

export function PackForm({
  code,
  rows,
  action,
}: {
  code: string;
  rows: LineRow[];
  action: (form: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const { qty, setQty, lines, total, tooMany } = useLines(rows, false);
  const { run, pending, error } = useServerAction(action);
  const requestId = useRequestId();
  const shown = useMemo(
    () => rows.filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase())),
    [rows, filter],
  );

  if (rows.length === 0) return <EmptyState>There&apos;s no loose stock here to pack.</EmptyState>;

  async function submit() {
    const form = new FormData();
    form.set("requestId", requestId.current());
    form.set("lines", JSON.stringify(lines));
    const r = await run(form);
    if (r?.ok) {
      requestId.renew();
      toast("success", r.message ?? "Packed.");
      router.push(`/boxes/${code}?packed=1`);
    }
  }

  return (
    <div className="space-y-3 pb-24">
      {rows.length > 6 && (
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter items…" className={inputClass} aria-label="Filter items" />
      )}
      <Card>
        <ul className="divide-y divide-gray-100">
          {shown.map((r) => (
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
      <StickyBar>
        {error && <FormError message={error} />}
        <Button className="min-h-14 w-full text-lg" disabled={pending || total === 0 || tooMany.length > 0} onClick={submit}>
          {pending ? "Packing…" : total === 0 ? "Choose quantities to pack" : `Pack ${total} piece${total === 1 ? "" : "s"} into ${code}`}
        </Button>
      </StickyBar>
    </div>
  );
}

export function UnpackForm({
  code,
  boxId,
  rows,
  action,
  afterDiscardHref,
}: {
  code: string;
  boxId: number;
  rows: LineRow[];
  action: (form: FormData) => Promise<ActionResult<{ empty: boolean }>>;
  afterDiscardHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { qty, setQty, ticked, setTicked, lines, total, tooMany } = useLines(rows, true);
  const { run, pending, error } = useServerAction(action);
  const discard = useServerAction(() => deleteBoxAction(boxId));
  const requestId = useRequestId();
  const [askDiscard, setAskDiscard] = useState(false);

  async function submit() {
    const form = new FormData();
    form.set("requestId", requestId.current());
    form.set("lines", JSON.stringify(lines));
    const r = await run(form);
    if (!r?.ok) return;
    requestId.renew();
    toast("success", r.message ?? "Unpacked.");
    if (r.data?.empty) setAskDiscard(true);
    else router.push(`/boxes/${code}`);
  }

  return (
    <div className="space-y-3 pb-24">
      <Card>
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <Row
              key={r.itemId}
              row={r}
              value={qty[r.itemId]}
              onChange={(v) => setQty((q) => ({ ...q, [r.itemId]: v }))}
              ticked={ticked[r.itemId]}
              onTick={(v) => setTicked((t) => ({ ...t, [r.itemId]: v }))}
              tickable
            />
          ))}
        </ul>
      </Card>
      <StickyBar>
        {error && <FormError message={error} />}
        <Button className="min-h-14 w-full text-lg" disabled={pending || total === 0 || tooMany.length > 0} onClick={submit}>
          {pending ? "Unpacking…" : total === 0 ? "Tick what to unpack" : `Unpack ${total} piece${total === 1 ? "" : "s"}`}
        </Button>
      </StickyBar>

      {askDiscard && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="discard-title">
          <Card className="w-full max-w-sm space-y-4 p-5">
            <h2 id="discard-title" className="text-lg font-bold">
              This box is now empty. Discard it?
            </h2>
            <p className="text-gray-700">Discarded boxes disappear from lists, but their history is kept.</p>
            {discard.error && <FormError message={discard.error} />}
            <div className="grid gap-2">
              <Button
                autoFocus
                className="min-h-14 text-lg"
                disabled={discard.pending}
                onClick={async () => {
                  const r = await discard.run();
                  if (r?.ok) {
                    toast("success", r.message ?? "Discarded.");
                    router.push(afterDiscardHref);
                  }
                }}
              >
                {discard.pending ? "Discarding…" : "Yes, discard it"}
              </Button>
              <Button variant="secondary" onClick={() => router.push(`/boxes/${code}`)}>
                No, keep the empty box
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-gray-200 bg-white/95 p-3 backdrop-blur md:bottom-0">
      <div className="mx-auto max-w-2xl space-y-2">{children}</div>
    </div>
  );
}
