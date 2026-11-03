import Link from "next/link";
import { boxCode, plural } from "@/lib/format";
import { BoxIcon } from "./icons";
import { Photo } from "./photo";
import { Card } from "./ui";

export type BoxPreview = {
  id: number;
  description: string | null;
  holdings: { quantity: number; item: { id: number; name: string; photos: { key: string }[] } }[];
};

/** Boxes with a preview of what's inside (thumbnails and counts). */
export function BoxList({ boxes }: { boxes: BoxPreview[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boxes.map((b) => {
        const pieces = b.holdings.reduce((s, h) => s + h.quantity, 0);
        return (
          <li key={b.id}>
            <Link href={`/boxes/${boxCode(b.id)}`} className="block">
              <Card className="p-3 active:bg-gray-50">
                <div className="flex items-center gap-2">
                  <BoxIcon className="text-brand-700" size={20} />
                  <span className="font-bold">{boxCode(b.id)}</span>
                  <span className="text-sm text-gray-600">
                    · {plural(b.holdings.length, "item")}, {plural(pieces, "piece")}
                  </span>
                </div>
                {b.description && <p className="mt-0.5 truncate text-sm text-gray-700">{b.description}</p>}
                {b.holdings.length > 0 && (
                  <div className="mt-2 flex gap-1.5 overflow-hidden">
                    {b.holdings.slice(0, 5).map((h) => (
                      <div key={h.item.id} className="relative shrink-0" title={`${h.quantity} × ${h.item.name}`}>
                        <Photo photoKey={h.item.photos[0]?.key} alt={h.item.name} className="h-12 w-12 rounded-md" />
                        <span className="absolute right-0.5 bottom-0.5 rounded bg-black/75 px-1 text-xs font-bold text-white">
                          {h.quantity}
                        </span>
                      </div>
                    ))}
                    {b.holdings.length > 5 && (
                      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-sm text-gray-600">
                        +{b.holdings.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
