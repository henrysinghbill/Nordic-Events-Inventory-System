import type { HistoryEntry } from "@/generated/prisma/client";
import { fmtDateTime } from "@/server/dates";
import { Card, EmptyState } from "./ui";

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return <EmptyState>Nothing has happened here yet.</EmptyState>;
  return (
    <Card>
      <ol className="divide-y divide-gray-100">
        {entries.map((e) => (
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
          </li>
        ))}
      </ol>
    </Card>
  );
}
