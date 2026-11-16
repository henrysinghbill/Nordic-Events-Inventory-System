"use client";

import { useState } from "react";
import { createTypeAction } from "@/app/(app)/items/actions";
import type { TypeOption } from "@/lib/type-suggest";
import { useToast } from "./toast";
import { Button, chipClass, cx, inputClass } from "./ui";
import { useServerAction } from "./use-server-action";

/**
 * Choose what kind of thing an item is: tap a type, tap it again for none.
 * "+ New type" adds one to the shared list straight away, so anyone can
 * extend it while filling in an item.
 */
export function TypePicker({
  types,
  value,
  onChange,
  name,
  suggested = false,
  onCreated,
}: {
  types: TypeOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Called with a type that was just added here, right before it is chosen. */
  onCreated?: (type: TypeOption) => void;
  /** When set, a hidden input is rendered so a plain <form> submits the choice. */
  name?: string;
  /** The current choice was guessed from the item's name: say so. */
  suggested?: boolean;
}) {
  const toast = useToast();
  // Types added here, kept until the page's own list includes them.
  const [added, setAdded] = useState<TypeOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const create = useServerAction(createTypeAction);
  const all = [...types, ...added.filter((a) => !types.some((t) => t.id === a.id))].sort((a, b) =>
    a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }),
  );

  function close() {
    setAdding(false);
    setText("");
    create.setError(null);
  }

  async function add() {
    if (!text.trim()) return;
    const result = await create.run(text);
    if (!result?.ok || !result.data) return;
    const type = { id: result.data.id, name: result.data.name };
    setAdded((list) => (list.some((t) => t.id === type.id) ? list : [...list, type]));
    onCreated?.(type);
    onChange(type.id);
    toast("success", result.message ?? "Type added.");
    close();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Type">
        {all.map((t) => {
          const on = t.id === value;
          return (
            <button key={t.id} type="button" aria-pressed={on} onClick={() => onChange(on ? null : t.id)} className={chipClass(on)}>
              {on && "✓ "}
              {t.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-11 items-center rounded-full border border-dashed border-gray-400 px-4 font-medium text-brand-700 active:bg-brand-50"
          >
            + New type
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex items-start gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault(); // don't submit the form around this picker
              void add();
            }}
            maxLength={40}
            autoFocus
            autoComplete="off"
            placeholder="e.g. Banner"
            aria-label="New type name"
            className={cx(inputClass, "min-w-0 flex-1", create.error && "border-red-500")}
          />
          <Button onClick={add} disabled={create.pending || !text.trim()}>
            {create.pending ? "Adding…" : "Add"}
          </Button>
          <Button variant="secondary" onClick={close} disabled={create.pending}>
            Cancel
          </Button>
        </div>
      )}
      {create.error && <p className="mt-1 text-sm font-medium text-red-700">{create.error}</p>}
      {suggested && value !== null && !adding && (
        <p className="mt-1 text-sm text-gray-500">Suggested from the name. Tap another type to change it, or tap it again for none.</p>
      )}
      {name && <input type="hidden" name={name} value={value ?? ""} />}
    </div>
  );
}
