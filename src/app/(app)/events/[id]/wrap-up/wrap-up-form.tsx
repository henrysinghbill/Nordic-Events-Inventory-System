"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/action-form";
import { QuantityInput } from "@/components/form-controls";
import { Photo } from "@/components/photo";
import { useToast } from "@/components/toast";
import { Button, Card, cx, inputClass } from "@/components/ui";
import { useRequestId, useServerAction } from "@/components/use-server-action";
import { ADJUST_REASONS } from "@/lib/adjust";
import { plural } from "@/lib/format";
import { wrapUpAction } from "../../actions";

export type CountItem = { itemId: number; name: string; photoKey: string | null; recorded: number };
export type WrapBox = { id: number; code: string; description: string | null; items: CountItem[]; defaultDestinationId: number | null };

function CountRow({ item, value, onChange }: { item: CountItem; value: string; onChange: (v: string) => void }) {
  const diff = Number.parseInt(value || "0", 10) - item.recorded;
  return (
    <li className={cx("space-y-2 px-4 py-3", diff !== 0 && "bg-amber-50")}>
      <div className="flex items-center gap-3">
        <Photo photoKey={item.photoKey} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-gray-600">
            Recorded: {item.recorded}
            {diff !== 0 && (
              <span className={cx("ml-2 font-semibold", diff < 0 ? "text-red-700" : "text-green-700")}>{diff > 0 ? `+${diff}` : diff}</span>
            )}
          </p>
        </div>
      </div>
      <QuantityInput id={`c-${item.itemId}`} value={value} min={0} onChange={onChange} />
    </li>
  );
}

/**
 * The post-event wrap-up, all on one page:
 *  1. count what's left in each box (and anything loose at the venue);
 *  2. choose where each box goes: ship it (back to storage), leave it, or discard it if empty.
 * Everything is saved together when "Finish" is pressed.
 */
export function WrapUpForm({
  eventId,
  eventName,
  venueName,
  boxes,
  loose,
  destinations,
}: {
  eventId: number;
  eventName: string;
  venueName: string;
  boxes: WrapBox[];
  loose: CountItem[];
  destinations: { id: number; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const requestId = useRequestId();
  const { run, pending, error } = useServerAction((form: FormData) => wrapUpAction(eventId, form));

  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ...boxes.flatMap((b) => b.items.map((i) => [`${b.id}:${i.itemId}`, String(i.recorded)])),
      ...loose.map((i) => [`loose:${i.itemId}`, String(i.recorded)]),
    ]),
  );
  const [then, setThen] = useState<Record<number, string>>({});
  const [packInto, setPackInto] = useState<Record<number, string>>(() =>
    Object.fromEntries(loose.map((i) => [i.itemId, boxes[0] ? String(boxes[0].id) : ""])),
  );
  const [reason, setReason] = useState("USED_AT_EVENT");
  const [note, setNote] = useState(eventName);

  const num = (key: string) => Number.parseInt(counts[key] || "0", 10);
  const set = (key: string) => (v: string) => setCounts((c) => ({ ...c, [key]: v }));
  const packedInto = (boxId: number) => loose.filter((i) => packInto[i.itemId] === String(boxId) && num(`loose:${i.itemId}`) > 0);
  const endsEmpty = (b: WrapBox) => b.items.every((i) => num(`${b.id}:${i.itemId}`) === 0) && packedInto(b.id).length === 0;
  /** The choice for a box: what the user picked, or a sensible default. */
  const choice = (b: WrapBox) =>
    then[b.id] ?? (endsEmpty(b) ? "discard" : b.defaultDestinationId ? `ship:${b.defaultDestinationId}` : "leave");

  const problems = boxes.filter((b) => choice(b) === "discard" && !endsEmpty(b));
  const changed =
    boxes.reduce((s, b) => s + b.items.filter((i) => num(`${b.id}:${i.itemId}`) !== i.recorded).length, 0) +
    loose.filter((i) => num(`loose:${i.itemId}`) !== i.recorded).length;
  const shipping = boxes.filter((b) => choice(b).startsWith("ship:")).length;
  const discarding = boxes.filter((b) => choice(b) === "discard").length;
  const leaving = boxes.length - shipping - discarding;

  const summary = [
    changed && `update ${plural(changed, "count")}`,
    shipping && `ship ${plural(shipping, "box", "boxes")}`,
    discarding && `discard ${plural(discarding, "empty box", "empty boxes")}`,
    leaving && `leave ${plural(leaving, "box", "boxes")} at ${venueName}`,
  ].filter(Boolean) as string[];

  async function finish() {
    if (!window.confirm(`Finish ${eventName}?\n\nThis will ${summary.length ? summary.join(", ") : "mark the event as wrapped up"}.`)) return;
    const plan = {
      reason,
      note,
      boxes: boxes.map((b) => {
        const c = choice(b);
        return {
          boxId: b.id,
          counts: b.items.map((i) => ({ itemId: i.itemId, actual: num(`${b.id}:${i.itemId}`) })),
          then: c.startsWith("ship:") ? { action: "ship", destinationId: Number(c.slice(5)) } : { action: c },
        };
      }),
      loose: loose.map((i) => ({ itemId: i.itemId, actual: num(`loose:${i.itemId}`), packInto: packInto[i.itemId] ? Number(packInto[i.itemId]) : null })),
    };
    const form = new FormData();
    form.set("requestId", requestId.current());
    form.set("plan", JSON.stringify(plan));
    const r = await run(form);
    if (r?.ok) {
      requestId.renew();
      toast("success", r.message ?? "Wrapped up.");
      router.push(`/events/${eventId}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {boxes.map((b) => {
        const c = choice(b);
        const extra = packedInto(b.id);
        return (
          <Card key={b.id} className="overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
              <h2 className="font-semibold">
                {b.code}
                {b.description && <span className="font-normal text-gray-600"> – {b.description}</span>}
              </h2>
              <p className="text-sm text-gray-600">How many of each are left in the box?</p>
            </div>
            {b.items.length === 0 ? (
              <p className="px-4 py-3 text-gray-600">This box is empty.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {b.items.map((i) => (
                  <CountRow key={i.itemId} item={i} value={counts[`${b.id}:${i.itemId}`]} onChange={set(`${b.id}:${i.itemId}`)} />
                ))}
              </ul>
            )}
            {extra.length > 0 && (
              <p className="px-4 pb-2 text-sm text-gray-600">Plus from the loose stock: {extra.map((i) => `${num(`loose:${i.itemId}`)} × ${i.name}`).join(", ")}</p>
            )}
            <div className="border-t border-gray-100 p-4">
              <label className="block">
                <span className="mb-1 block font-medium">Then</span>
                <select value={c} onChange={(e) => setThen((t) => ({ ...t, [b.id]: e.target.value }))} className={inputClass}>
                  {destinations.map((d) => (
                    <option key={d.id} value={`ship:${d.id}`}>
                      Ship to {d.name}
                    </option>
                  ))}
                  <option value="leave">Leave it at {venueName}</option>
                  <option value="discard">Discard the box (only if empty)</option>
                </select>
              </label>
              {c === "discard" && !endsEmpty(b) && (
                <p className="mt-1 text-sm font-medium text-red-700">This box isn&apos;t empty, so it can&apos;t be discarded.</p>
              )}
            </div>
          </Card>
        );
      })}

      {loose.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
            <h2 className="font-semibold">Loose at {venueName}</h2>
            <p className="text-sm text-gray-600">Things that were unpacked at the event. How many are left?</p>
          </div>
          <ul className="divide-y divide-gray-100">
            {loose.map((i) => (
              <li key={i.itemId}>
                <ul>
                  <CountRow item={i} value={counts[`loose:${i.itemId}`]} onChange={set(`loose:${i.itemId}`)} />
                </ul>
                {num(`loose:${i.itemId}`) > 0 && (
                  <div className="px-4 pb-3">
                    <select
                      value={packInto[i.itemId]}
                      onChange={(e) => setPackInto((p) => ({ ...p, [i.itemId]: e.target.value }))}
                      className={inputClass}
                      aria-label={`What to do with ${i.name}`}
                    >
                      {boxes.map((b) => (
                        <option key={b.id} value={b.id}>
                          Pack into {b.code}
                        </option>
                      ))}
                      <option value="">Leave loose at {venueName}</option>
                    </select>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block font-medium">Reason for changed counts</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
            {ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-sm text-gray-500">For something damaged or lost, you can also use Count / adjust on the box afterwards.</span>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">
            Note <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </label>
        {summary.length > 0 && <p className="text-gray-700">This will {summary.join(", ")}.</p>}
        {error && <FormError message={error} />}
        <Button className="min-h-14 w-full text-lg" disabled={pending || problems.length > 0} onClick={finish}>
          {pending ? "Saving…" : "Finish and wrap up the event"}
        </Button>
      </Card>
    </div>
  );
}
