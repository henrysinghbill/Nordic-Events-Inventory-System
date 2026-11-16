import Link from "next/link";
import { withBack } from "@/lib/back";
import { boxCode, plural } from "@/lib/format";
import { BoxIcon, CalendarIcon } from "./icons";
import { Photo } from "./photo";
import { Badge, Card } from "./ui";

export type BoxPreview = {
  id: number;
  description: string | null;
  holdings: { quantity: number; item: { id: number; name: string; photos: { key: string }[] } }[];
  /** Where the box is, when the list doesn't already say so ("Copenhagen storeroom", "Copenhagen → Barcelona"). */
  place?: string | null;
  /** True while the box is on the move. */
  inTransit?: boolean;
  /** The event it is packed for (only events that are still open). */
  event?: string | null;
};

/** A box as loaded for a list (see boxesList in src/server/queries.ts). */
type LoadedBox = Pick<BoxPreview, "id" | "description" | "holdings"> & {
  status: "AT_LOCATION" | "IN_TRANSIT";
  location: { name: string } | null;
  origin: { name: string } | null;
  destination: { name: string } | null;
  event: { name: string; wrappedUpAt: Date | null } | null;
};

/**
 * What the list shows for a loaded box. A box in transit always shows its
 * route; `showLocation` adds the location for boxes that are somewhere
 * (leave it off when the list is already grouped by location).
 */
export function boxPreview(box: LoadedBox, { showLocation }: { showLocation: boolean }): BoxPreview {
  const inTransit = box.status === "IN_TRANSIT";
  return {
    id: box.id,
    description: box.description,
    holdings: box.holdings,
    inTransit,
    place: inTransit
      ? `${box.origin?.name ?? "?"} → ${box.destination?.name ?? "?"}`
      : showLocation
        ? (box.location?.name ?? null)
        : null,
    event: box.event && !box.event.wrappedUpAt ? box.event.name : null,
  };
}

/**
 * Boxes with a preview of what's inside (thumbnails and counts).
 * `back` is the page showing the list, so a box's back link returns to it.
 */
export function BoxList({ boxes, back }: { boxes: BoxPreview[]; back?: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boxes.map((b) => {
        const pieces = b.holdings.reduce((s, h) => s + h.quantity, 0);
        return (
          <li key={b.id}>
            <Link href={withBack(`/boxes/${boxCode(b.id)}`, back)} className="block h-full">
              <Card className="h-full p-3 active:bg-gray-50">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <BoxIcon className={b.inTransit ? "text-amber-600" : "text-brand-700"} size={20} />
                  <span className="font-bold">{boxCode(b.id)}</span>
                  {b.holdings.length > 0 ? (
                    <span className="text-sm text-gray-600">
                      · {plural(b.holdings.length, "item")}, {plural(pieces, "piece")}
                    </span>
                  ) : (
                    <Badge>Empty</Badge>
                  )}
                </div>
                {b.description && <p className="mt-0.5 truncate text-sm text-gray-700">{b.description}</p>}
                {b.place && <p className="mt-0.5 truncate text-sm text-gray-600">{b.place}</p>}
                {b.event && (
                  <p className="mt-1 flex items-center gap-1 text-sm font-medium text-brand-800">
                    <CalendarIcon size={14} className="shrink-0" />
                    <span className="truncate">For {b.event}</span>
                  </p>
                )}
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
