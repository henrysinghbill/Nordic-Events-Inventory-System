import Link from "next/link";
import { plural } from "@/lib/format";
import type { LocationOverview } from "@/server/queries";
import { ChevronRightIcon } from "./icons";
import { Badge, Card } from "./ui";

export function LocationCard({ loc }: { loc: LocationOverview }) {
  return (
    <Link href={`/locations/${loc.id}`} className="block">
      <Card className="flex items-center gap-3 p-4 active:bg-gray-50">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{loc.name}</h3>
            <Badge tone={loc.type === "STORAGE" ? "brand" : "amber"}>
              {loc.type === "STORAGE" ? "Storage" : "Event venue"}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">{loc.country}</p>
          <p className="mt-1 text-sm">
            {plural(loc.itemCount, "item")} · {plural(loc.pieceCount, "piece")} · {plural(loc.boxCount, "box", "boxes")}
          </p>
        </div>
        <ChevronRightIcon className="shrink-0 text-gray-400" />
      </Card>
    </Link>
  );
}
