"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { inputClass } from "./ui";

/**
 * Less-used filters, folded away so the results start higher up the screen.
 * Opens by itself when one of them is switched on (e.g. arriving from
 * "items without a photo"), and never snaps shut while you're using it.
 */
export function MoreFilters({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(activeCount > 0);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-brand-700 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
        More filters
        {activeCount > 0 && (
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">{activeCount} on</span>
        )}
      </summary>
      <div className="space-y-1 pb-1">{children}</div>
    </details>
  );
}

/** A select that updates one URL search parameter (so filters survive reloads and can be shared). */
export function FilterSelect({
  param,
  label,
  options,
  allLabel,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select
        className={inputClass}
        value={params.get(param) ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value) next.set(param, e.target.value);
          else next.delete(param);
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
