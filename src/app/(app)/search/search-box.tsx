"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { cx, inputClass } from "@/components/ui";

/** Updates ?q= as you type (debounced), so results follow the text. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    if ((params.get("q") ?? "") === value) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value);
      else next.delete("q");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={20} />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        autoComplete="off"
        className={cx(inputClass, "pl-10")}
      />
    </div>
  );
}

/** A checkbox that switches a ?param=1 filter on and off. */
export function ParamToggle({ param, label }: { param: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const on = params.get(param) === "1";
  return (
    <label className="flex min-h-12 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        className="h-5 w-5 accent-brand-600"
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.checked) next.set(param, "1");
          else next.delete(param);
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      />
      {label}
    </label>
  );
}
