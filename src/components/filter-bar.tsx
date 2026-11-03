"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "./ui";

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
