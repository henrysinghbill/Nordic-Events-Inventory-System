"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { BoxIcon, CalendarIcon, GridIcon, HomeIcon, MenuIcon, ScanIcon } from "./icons";
import { cx } from "./ui";

type NavLink = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** The big button in the middle of the phone bar. */
  primary?: boolean;
  /** Only in the top bar on computers; on phones it is reached through More. */
  desktopOnly?: boolean;
  match: (path: string) => boolean;
};

/** True for the section's own page and everything below it ("/items", "/items/12", not "/items-old"). */
const under =
  (...sections: string[]) =>
  (path: string) =>
    sections.some((s) => path === s || path.startsWith(`${s}/`));

/**
 * One place for each thing people look for:
 *   Home  — what's going on (warnings, events, in transit, locations) and "find anything"
 *   Items — everything we have, with search and filters
 *   Boxes — every box and what's in it
 */
const LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p) => p === "/" || under("/locations", "/search")(p) },
  { href: "/items", label: "Items", icon: GridIcon, match: under("/items") },
  { href: "/scan", label: "Scan", icon: ScanIcon, primary: true, match: under("/scan") },
  { href: "/boxes", label: "Boxes", icon: BoxIcon, match: under("/boxes") },
  { href: "/events", label: "Events", icon: CalendarIcon, desktopOnly: true, match: under("/events") },
  { href: "/menu", label: "More", icon: MenuIcon, match: under("/menu", "/admin", "/activity") },
];

/** Phones: fixed bottom bar with a big centre button. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-lg items-end justify-around px-1">
        {LINKS.filter((l) => !l.desktopOnly).map(({ href, label, icon: Icon, primary, match }) => {
          // Events has no button of its own on phones, so More lights up for it.
          const active = match(pathname) || (href === "/menu" && under("/events")(pathname));
          return (
            <li key={href} className="flex-1">
              {primary ? (
                <Link href={href} className="flex flex-col items-center pt-1 pb-1.5" aria-current={active ? "page" : undefined}>
                  <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white active:bg-brand-800">
                    <Icon size={28} />
                  </span>
                  <span className="mt-0.5 text-xs font-semibold text-brand-700">{label}</span>
                </Link>
              ) : (
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 pt-1 pb-1.5 text-xs font-medium",
                    active ? "text-brand-700" : "text-gray-500",
                  )}
                >
                  <Icon size={24} />
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop: links in the top bar. */
export function TopNavLinks() {
  const pathname = usePathname();
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {LINKS.map(({ href, label, primary, match }) => (
        <li key={href}>
          <Link
            href={href}
            aria-current={match(pathname) ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-2 font-medium",
              primary
                ? "bg-white text-brand-700 hover:bg-brand-50"
                : match(pathname)
                  ? "bg-brand-700 text-white"
                  : "text-white/90 hover:bg-brand-700",
            )}
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
