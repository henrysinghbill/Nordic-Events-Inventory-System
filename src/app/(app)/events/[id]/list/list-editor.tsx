"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/action-form";
import { QuantityInput } from "@/components/form-controls";
import { CloseIcon, PlusIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { useToast } from "@/components/toast";
import { Button, Card, chipClass, EmptyState, inputClass } from "@/components/ui";
import { useServerAction } from "@/components/use-server-action";
import type { TypeOption } from "@/lib/type-suggest";
import { savePackingListAction } from "../../actions";

export type ListRow = { itemId: number; name: string; photoKey: string | null; quantity: string };
type Suggestion = { id: number; name: string; photoKey: string | null; type: string | null };

/**
 * Edit an event's packing list: find items to add (by typing, or by browsing
 * a type such as Banner) and set how many are needed.
 */
export function PackingListEditor({
  eventId,
  initial,
  types,
}: {
  eventId: number;
  initial: ListRow[];
  /** Types that have items, for "browse a type". */
  types: TypeOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [typeId, setTypeId] = useState<number | null>(null);
  // Results are kept with the search they belong to, so a slow reply is never shown for a newer search.
  const [found, setFound] = useState<{ key: string; items: Suggestion[] }>({ key: "", items: [] });
  const [searchError, setSearchError] = useState(false);
  const { run, pending, error } = useServerAction((form: FormData) => savePackingListAction(eventId, form));
  const focusId = useRef<number | null>(null);

  const text = q.trim();
  const searching = text.length >= 2 || typeId !== null;
  const searchKey = `${typeId ?? ""}|${text}`;

  // Search existing items as the user types or picks a type (debounced).
  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ wide: "1", q: text });
        if (typeId) params.set("type", String(typeId));
        const res = await fetch(`/api/items/suggest?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        setFound({ key: searchKey, items: ((await res.json()) as { items: Suggestion[] }).items });
        setSearchError(false);
      } catch {
        if (!ctrl.signal.aborted) setSearchError(true);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searching, searchKey, text, typeId]);

  useEffect(() => {
    if (focusId.current === null) return;
    document.getElementById(`need-${focusId.current}`)?.focus();
    focusId.current = null;
  }, [rows]);

  const loaded = searching && found.key === searchKey;
  /** The type being browsed, if any: typed words then only narrow that type down. */
  const browsed = types.find((t) => t.id === typeId);
  const shown = loaded ? found.items : [];
  const onList = new Set(rows.map((r) => r.itemId));
  const dirty = JSON.stringify(rows.map((r) => [r.itemId, r.quantity])) !== JSON.stringify(initial.map((r) => [r.itemId, r.quantity]));

  function add(s: Suggestion) {
    // After a typed search, jump to the new line's quantity. While browsing a type,
    // stay in the list so several items can be added one after another.
    const browsing = typeId !== null;
    if (!onList.has(s.id)) {
      if (!browsing) focusId.current = s.id;
      setRows((r) => [...r, { itemId: s.id, name: s.name, photoKey: s.photoKey, quantity: "1" }]);
    }
    if (!browsing) setQ("");
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
          placeholder="Start typing a name, type or company…"
          className={inputClass}
          autoComplete="off"
        />
        {types.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Browse a type">
            <span className="text-sm text-gray-600">Or browse a type:</span>
            {types.map((t) => {
              const on = t.id === typeId;
              return (
                <button key={t.id} type="button" aria-pressed={on} onClick={() => setTypeId(on ? null : t.id)} className={chipClass(on)}>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
        {searchError && <p className="mt-2 text-sm text-red-700">Couldn&apos;t search right now. Check your signal and try again.</p>}
        {searching && !loaded && !searchError && <p className="mt-2 text-sm text-gray-500">Searching…</p>}
        {shown.length > 0 && (
          <ul className="mt-2 max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-xl ring-1 ring-gray-200">
            {shown.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => add(s)}
                  disabled={onList.has(s.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-gray-50 disabled:opacity-50"
                >
                  <Photo photoKey={s.photoKey} alt="" className="h-10 w-10 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.name}</span>
                    {s.type && <span className="block text-sm text-gray-500">{s.type}</span>}
                  </span>
                  {onList.has(s.id) ? <span className="text-sm text-gray-500">On the list</span> : <PlusIcon className="text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {loaded && shown.length === 0 && !searchError && (
          <p className="mt-2 text-sm text-gray-500">
            {browsed && text ? (
              <>
                Nothing of the type {browsed.name} matches that.{" "}
                <button type="button" className="font-medium text-brand-700" onClick={() => setTypeId(null)}>
                  Search all types
                </button>
              </>
            ) : (
              "No matching items. Items have to be added to the inventory first."
            )}
          </p>
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
