"use client";

import { useMemo, useState } from "react";
import { FormError } from "@/components/action-form";
import { CheckIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { useToast } from "@/components/toast";
import { TypePicker } from "@/components/type-picker";
import { Button, Card, cx } from "@/components/ui";
import { useServerAction } from "@/components/use-server-action";
import { plural } from "@/lib/format";
import { suggestType, type TypeOption } from "@/lib/type-suggest";
import { StickyBar } from "../../boxes/[code]/lines-form";
import { setItemsTypeAction } from "../actions";

type Item = { id: number; name: string; photoKey: string | null; companies: string[] };

/**
 * Step 1: choose a type. Step 2: tick the items that are one (those whose
 * name mentions the type start ticked). Saving removes them from this list.
 */
export function UntypedAssigner({ items, types }: { items: Item[]; types: TypeOption[] }) {
  const toast = useToast();
  const { run, pending, error } = useServerAction(setItemsTypeAction);
  const [typeId, setTypeId] = useState<number | null>(null);
  // Types added on this page, until the page's own list includes them.
  const [created, setCreated] = useState<TypeOption[]>([]);
  // Ticks changed by hand; everything else follows the suggestion for the chosen type.
  const [byHand, setByHand] = useState<Record<number, boolean>>({});

  const allTypes = useMemo(
    () => [...types, ...created.filter((c) => !types.some((t) => t.id === c.id))],
    [types, created],
  );
  const type = allTypes.find((t) => t.id === typeId) ?? null;
  const suggested = useMemo(
    () => new Set(type ? items.filter((i) => suggestType(i.name, allTypes)?.id === type.id).map((i) => i.id) : []),
    [type, items, allTypes],
  );
  // Suggested items come first, so the ones ticked for you are in view (the order doesn't change while ticking).
  const ordered = useMemo(
    () => [...items].sort((a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id))),
    [items, suggested],
  );
  const isTicked = (id: number) => byHand[id] ?? suggested.has(id);
  const ticked = type ? items.filter((i) => isTicked(i.id)) : [];
  const untouchedGuesses = type ? items.filter((i) => suggested.has(i.id) && byHand[i.id] === undefined).length : 0;

  function chooseType(id: number | null) {
    setTypeId(id);
    setByHand({}); // each type starts from its own suggestions
  }

  async function save() {
    if (!type || ticked.length === 0) return;
    const form = new FormData();
    form.set("typeId", String(type.id));
    ticked.forEach((i) => form.append("itemIds", String(i.id)));
    const result = await run(form);
    if (!result?.ok) return;
    toast("success", result.message ?? "Saved.");
    chooseType(null);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="space-y-4 pb-28">
      <Card className="p-4">
        <p className="mb-2 font-medium">1. Which type?</p>
        <TypePicker
          types={allTypes}
          value={typeId}
          onChange={chooseType}
          onCreated={(t) => setCreated((list) => [...list, t])}
        />
      </Card>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-medium">
            2. {type ? `Tick every item of the type ${type.name}` : "Then tick the items of that type"}
          </p>
          <p className="text-sm text-gray-600">
            {type ? `${ticked.length} of ${items.length} ticked` : plural(items.length, "item")}
          </p>
        </div>
        {untouchedGuesses > 0 && (
          <p className="mb-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-200">
            {untouchedGuesses === 1 ? "1 item is" : `${untouchedGuesses} items are`} already ticked because the name mentions{" "}
            {type?.name}. Check {untouchedGuesses === 1 ? "it" : "them"}, and tick any others.
          </p>
        )}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {ordered.map((item) => {
            const on = Boolean(type) && isTicked(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!type}
                  onClick={() => setByHand((m) => ({ ...m, [item.id]: !on }))}
                  className={cx(
                    "relative block w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-black/5 transition-shadow",
                    on && "ring-2 ring-brand-600",
                    !type && "opacity-60",
                  )}
                >
                  <Photo photoKey={item.photoKey} alt="" className="aspect-square w-full" />
                  {on && (
                    <span className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow">
                      <CheckIcon size={18} />
                    </span>
                  )}
                  <span className="block p-2.5">
                    <span className="line-clamp-2 leading-snug font-medium">{item.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{item.companies.join(", ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <StickyBar>
        {error && <FormError message={error} />}
        <Button className="min-h-14 w-full text-lg" disabled={pending || !type || ticked.length === 0} onClick={save}>
          {pending
            ? "Saving…"
            : !type
              ? "Choose a type first"
              : ticked.length === 0
                ? "Tick the items to set"
                : `Set ${plural(ticked.length, "item")} as ${type.name}`}
        </Button>
      </StickyBar>
    </div>
  );
}
