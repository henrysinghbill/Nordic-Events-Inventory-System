"use client";

import { MinusIcon, PlusIcon } from "./icons";
import { cx, inputClass } from "./ui";

/** Big tappable chips for choosing one or more companies. */
export function CompanyChips({
  companies,
  selected,
  onChange,
  name,
  error,
}: {
  companies: { id: number; name: string }[];
  selected: number[];
  onChange?: (ids: number[]) => void;
  /** When set, hidden inputs are rendered so a plain <form> submits the selection. */
  name?: string;
  error?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Companies">
        {companies.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange?.(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
              className={cx(
                "min-h-11 rounded-full border px-4 font-medium transition-colors",
                on
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-gray-300 bg-white text-gray-800 active:bg-gray-100",
              )}
            >
              {on && "✓ "}
              {c.name}
            </button>
          );
        })}
      </div>
      {name && selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      {error && <p className="mt-1 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

/** Number input with large − / + buttons. Value is kept as text so the field can be cleared while typing. */
export function QuantityInput({
  value,
  onChange,
  id = "quantity",
  name,
  min = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  name?: string;
  min?: number;
}) {
  const n = Number.parseInt(value, 10);
  const step = (delta: number) => onChange(String(Math.max(min, (Number.isNaN(n) ? 0 : n) + delta)));
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Decrease"
        className="flex w-14 items-center justify-center rounded-xl border border-gray-300 bg-white active:bg-gray-100"
      >
        <MinusIcon />
      </button>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => e.target.select()}
        className={cx(inputClass, "text-center text-xl font-semibold")}
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Increase"
        className="flex w-14 items-center justify-center rounded-xl border border-gray-300 bg-white active:bg-gray-100"
      >
        <PlusIcon />
      </button>
    </div>
  );
}
