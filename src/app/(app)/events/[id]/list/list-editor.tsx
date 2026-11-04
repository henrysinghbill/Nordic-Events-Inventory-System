"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/action-form";
import { QuantityInput } from "@/components/form-controls";
import { CloseIcon, PlusIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, inputClass } from "@/components/ui";
import { useServerAction } from "@/components/use-server-action";
import { savePackingListAction } from "../../actions";

export type ListRow = { itemId: number; name: string; photoKey: string | null; quantity: string };
type Suggestion = { id: number; name: string; photoKey: string | null };

/** Edit an event's packing list: search items to add, set how many are needed. */
export function PackingListEditor({ eventId, initial }: { eventId: number; initial: ListRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Suggestion[]>([]);
  const [searchError, setSearchError] = useState(false);
  const { run, pending, error } = useServerAction((form: FormData) => savePackingListAction(eventId, form));
  const focusId = useRef<number | null>(null);

  // Search existing items as the user types (debounced).
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items/suggest?q=${encodeURIComponent(text)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        setFound(((await res.json()) as { items: Suggestion[] }).items);
        setSearchError(false);
      } catch {
        if (!ctrl.signal.aborted) setSearchError(true);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    if (focusId.current === null) return;
    document.getElementById(`need-${focusId.current}`)?.focus();
    focusId.current = null;
  }, [rows]);

  const shown = q.trim().length >= 2 ? found : [];
  const onList = new Set(rows.map((r) => r.itemId));
  const dirty = JSON.stringify(rows.map((r) => [r.itemId, r.quantity])) !== JSON.stringify(initial.map((r) => [r.itemId, r.quantity]));

  function add(s: Suggestion) {
    if (!onList.has(s.id)) {
      focusId.current = s.id;
      setRows((r) => [...r, { itemId: s.id, name: s.name, photoKey: s.photoKey, quantity: "1" }]);
    }
    setQ("");
  }

  async function save() {
    const form = new FormData();
    form.set("lines", JSON.stringify(rows.map((r) => ({ itemId: r.itemId, quantity: Number.parseInt(r.quantity || "0", 10) }))));
    const r = await run(form);
    if (r?.ok) {
      toast("success", r.message ?? "Saved.");
      router.push(`/events/${eventId}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <Card className="p-4">
        <label htmlFor="item-search" className="mb-1 block font-medium">
          Add an item
        </label>
        <input
          id="item-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Start typing an item name…"
          className={inputClass}
          autoComplete="off"
        />
        {searchError && <p className="mt-2 text-sm text-red-700">Couldn&apos;t search right now. Check your signal and try again.</p>}
        {shown.length > 0 && (
          <ul className="mt-2 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200">
            {shown.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => add(s)}
                  disabled={onList.has(s.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-gray-50 disabled:opacity-50"
                >
                  <Photo photoKey={s.photoKey} alt="" className="h-10 w-10 shrink-0 rounded-lg" />
                  <span className="flex-1 font-medium">{s.name}</span>
                  {onList.has(s.id) ? <span className="text-sm text-gray-500">On the list</span> : <PlusIcon className="text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && shown.length === 0 && !searchError && (
          <p className="mt-2 text-sm text-gray-500">No matching items. Items have to be added to the inventory first.</p>
        )}
      </Card>

      {rows.length === 0 ? (
        <EmptyState>The list is empty. Search above to add items.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.itemId} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Photo photoKey={r.photoKey} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
                  <p className="min-w-0 flex-1 font-medium">{r.name}</p>
                  <Button
                    variant="ghost"
                    className="min-h-10 px-2 text-gray-500"
                    aria-label={`Remove ${r.name}`}
                    onClick={() => setRows((all) => all.filter((x) => x.itemId !== r.itemId))}
                  >
                    <CloseIcon size={20} />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-sm text-gray-600">Needed</span>
                  <div className="flex-1">
                    <QuantityInput
                      id={`need-${r.itemId}`}
                      value={r.quantity}
                      min={1}
                      onChange={(v) => setRows((all) => all.map((x) => (x.itemId === r.itemId ? { ...x, quantity: v } : x)))}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <FormError message={error} />}
      <Button className="min-h-14 w-full text-lg" disabled={pending || !dirty} onClick={save}>
        {pending ? "Saving…" : dirty ? "Save packing list" : "No changes"}
      </Button>
    </div>
  );
}
