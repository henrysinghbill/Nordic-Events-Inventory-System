import Link from "next/link";
import type { HistoryEntry } from "@/generated/prisma/client";
import { fmtDateTime } from "@/server/dates";
import { Card, EmptyState } from "./ui";

export type HistoryLink = { href: string; label: string };

export function HistoryList({
  entries,
  links,
  empty = "Nothing has happened here yet.",
}: {
  entries: HistoryEntry[];
  /** Optional links shown under each entry (e.g. to its item, box or event). */
  links?: (entry: HistoryEntry) => HistoryLink[];
  empty?: string;
}) {
  if (entries.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <Card>
      <ol className="divide-y divide-gray-100">
        {entries.map((e) => {
          const extra = links?.(e) ?? [];
          return (
            <li key={e.id} className="px-4 py-3">
              <p className="font-medium">{e.summary}</p>
              {(e.reason || e.note) && (
                <p className="text-sm text-gray-700">
                  {e.reason && <span className="font-medium">{e.reason}</span>}
                  {e.reason && e.note && " — "}
                  {e.note}
                </p>
              )}
              <p className="text-sm text-gray-500">
                {e.userName} · {fmtDateTime(e.createdAt)}
              </p>
              {extra.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {extra.map((l) => (
                    <Link key={l.href} href={l.href} className="font-medium text-brand-700">
                      {l.label} →
                    </Link>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
