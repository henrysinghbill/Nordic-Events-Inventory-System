"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, MenuIcon, PinIcon, PlusIcon, SearchIcon } from "./icons";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/search", label: "Search", icon: SearchIcon, match: (p: string) => p.startsWith("/search") || p.startsWith("/items/") && p !== "/items/new" },
  { href: "/items/new", label: "Add", icon: PlusIcon, primary: true, match: (p: string) => p === "/items/new" },
  { href: "/locations", label: "Locations", icon: PinIcon, match: (p: string) => p.startsWith("/locations") },
  { href: "/menu", label: "More", icon: MenuIcon, match: (p: string) => p.startsWith("/menu") || p.startsWith("/admin") },
];

/** Phones: fixed bottom bar with a big centre button. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-lg items-end justify-around px-1">
        {LINKS.map(({ href, label, icon: Icon, primary, match }) => {
          const active = match(pathname);
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
            className={cx(
              "rounded-lg px-3 py-2 font-medium",
              primary
                ? "bg-white text-brand-700 hover:bg-brand-50"
                : match(pathname)
                  ? "bg-brand-700 text-white"
                  : "text-white/90 hover:bg-brand-700",
            )}
          >
            {primary ? "+ Add item" : label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
