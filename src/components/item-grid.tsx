import Link from "next/link";
import { Photo } from "./photo";
import { Badge } from "./ui";

export type GridItem = {
  id: number;
  name: string;
  photoKey: string | null;
  quantity: number;
  companies: string[];
  archived?: boolean;
};

/** Photo grid of items with quantities — the main way to see what's somewhere. */
export function ItemGrid({ items }: { items: GridItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/items/${item.id}`}
            className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 active:bg-gray-50"
          >
            <div className="relative">
              <Photo photoKey={item.photoKey} alt={item.name} className="aspect-square w-full" />
              <span className="absolute right-2 bottom-2 rounded-lg bg-black/75 px-2 py-0.5 text-sm font-bold text-white">
                {item.quantity}
              </span>
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 leading-snug font-medium">{item.name}</p>
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
