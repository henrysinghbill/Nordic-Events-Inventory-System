import Link from "next/link";
import { withBack } from "@/lib/back";
import { PinIcon } from "./icons";
import { Photo } from "./photo";
import { Badge } from "./ui";

export type GridItem = {
  id: number;
  name: string;
  photoKey: string | null;
  quantity: number;
  companies: string[];
  archived?: boolean;
  /** What kind of thing it is (Banner, Leaflet…), shown on the photo. */
  type?: string | null;
  /**
   * Where it is, in a few words ("BOX-0012 · Copenhagen storeroom"); null when
   * none is in stock. Leave it out where that is obvious, e.g. a location's own list.
   */
  where?: string | null;
};

/**
 * Photo grid of items with quantities — the main way to see what's somewhere.
 * `back` is the page showing the grid, so an item's back link returns to it.
 */
export function ItemGrid({ items, back }: { items: GridItem[]; back?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={withBack(`/items/${item.id}`, back)}
            className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 active:bg-gray-50"
          >
            <div className="relative">
              <Photo photoKey={item.photoKey} alt={item.name} className="aspect-square w-full" />
              {item.type && (
                <span className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-gray-800 shadow-sm">
                  {item.type}
                </span>
              )}
              <span className="absolute right-2 bottom-2 rounded-lg bg-black/75 px-2 py-0.5 text-sm font-bold text-white">
                {item.quantity}
              </span>
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 leading-snug font-medium">{item.name}</p>
              {item.where !== undefined && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-700">
                  <PinIcon size={12} className="shrink-0 text-gray-400" />
                  <span className="truncate">{item.where ?? "None in stock"}</span>
                </p>
              )}
              <p className="mt-0.5 truncate text-xs text-gray-500">{item.companies.join(", ")}</p>
              {item.archived && (
                <div className="mt-1">
                  <Badge>Archived</Badge>
                </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
