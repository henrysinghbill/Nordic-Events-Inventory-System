import Link from "next/link";
import { chipClass } from "./ui";

export type LinkChip = { href: string; label: string; active: boolean };

/**
 * A row of filter chips that are plain links, so the choice lives in the
 * address (survives reloads, can be shared). On phones the row scrolls
 * sideways instead of pushing the results down; on wider screens it wraps.
 */
export function LinkChips({ label, chips }: { label: string; chips: LinkChip[] }) {
  return (
    <nav aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {chips.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          replace
          scroll={false}
          aria-current={c.active ? "true" : undefined}
          className={chipClass(c.active)}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  );
}
