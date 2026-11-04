"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "./action-form";
import { QuantityInput } from "./form-controls";
import { Photo } from "./photo";
import { useToast } from "./toast";
import { Button, Card, cx, inputClass } from "./ui";
import { useRequestId, useServerAction } from "./use-server-action";
import type { ActionResult } from "@/lib/action-result";
import { ADJUST_REASONS } from "@/lib/adjust";

export type CountRow = { itemId: number; name: string; photoKey: string | null; recorded: number };

/**
 * "Count / adjust": enter what's actually there now. Only changed rows are
 * saved, all with the chosen reason.
 */
export function CountForm({
  rows,
  action,
  doneHref,
}: {
  rows: CountRow[];
  action: (form: FormData) => Promise<ActionResult>;
  doneHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { run, pending, error, fieldErrors } = useServerAction(action);
  const requestId = useRequestId();
  const [counts, setCounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, String(r.recorded)])),
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const changes = rows
    .map((r) => ({ itemId: r.itemId, actual: Number.parseInt(counts[r.itemId] || "0", 10), recorded: r.recorded }))
    .filter((l) => l.actual !== l.recorded);

  async function save() {
    const form = new FormData();
    form.set("requestId", requestId.current());
    form.set("reason", reason);
    form.set("note", note);
    form.set("lines", JSON.stringify(changes.map(({ itemId, actual }) => ({ itemId, actual }))));
    const r = await run(form);
    if (r?.ok) {
      requestId.renew();
      toast("success", r.message ?? "Saved.");
      router.push(doneHref);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => {
            const actual = Number.parseInt(counts[r.itemId] || "0", 10);
            const diff = actual - r.recorded;
            return (
              <li key={r.itemId} className={cx("space-y-2 px-4 py-3", diff !== 0 && "bg-amber-50")}>
                <div className="flex items-center gap-3">
                  <Photo photoKey={r.photoKey} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-gray-600">
                      Recorded: {r.recorded}
                      {diff !== 0 && (
                        <span className={cx("ml-2 font-semibold", diff < 0 ? "text-red-700" : "text-green-700")}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <QuantityInput
                  id={`count-${r.itemId}`}
                  value={counts[r.itemId]}
                  min={0}
                  onChange={(v) => setCounts((c) => ({ ...c, [r.itemId]: v }))}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block font-medium">Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={cx(inputClass, fieldErrors.reason && "border-red-500")}>
            <option value="">Choose…</option>
            {ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {fieldErrors.reason && <span className="mt-1 block text-sm font-medium text-red-700">{fieldErrors.reason}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">
            Note <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. Vitafoods Barcelona 2026" />
        </label>
        {error && <FormError message={error} />}
        <Button className="min-h-14 w-full text-lg" disabled={pending || changes.length === 0 || !reason} onClick={save}>
          {pending
            ? "Saving…"
            : changes.length === 0
              ? "Change a count to save"
              : !reason
                ? "Choose a reason"
                : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`}
        </Button>
      </Card>
    </div>
  );
}
