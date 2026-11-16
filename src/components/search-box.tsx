"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchIcon } from "./icons";
import { cx, inputClass } from "./ui";

/**
 * Updates ?q= as you type (debounced), so results follow the text.
 *
 * The address is the source of truth: if something else changes it (tapping
 * the page's own button in the navigation, a link that clears the search),
 * the box follows. While you are typing, the box wins, so a slow reply can
 * never overwrite what you typed.
 */
export function SearchBox({ placeholder, autoFocus }: { placeholder: string; autoFocus?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  /** Text typed here that the address doesn't show yet (null: nothing outstanding). */
  const [pending, setPending] = useState<string | null>(null);
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ);

  if (urlQ !== seenUrlQ) {
    setSeenUrlQ(urlQ);
    if (pending === null) {
      if (urlQ !== value) setValue(urlQ); // changed from outside: show it
    } else if (urlQ === pending) {
      setPending(null); // the address caught up with the typing
    }
  }

  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => {
      if (pending === urlQ) return setPending(null);
      const next = new URLSearchParams(params);
      if (pending) next.set("q", pending);
      else next.delete("q");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [pending, urlQ, params, pathname, router]);

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={20} />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setPending(e.target.value.trim() ? e.target.value : "");
        }}
        placeholder={placeholder}
        aria-label="Search"
        autoComplete="off"
        autoFocus={autoFocus}
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
