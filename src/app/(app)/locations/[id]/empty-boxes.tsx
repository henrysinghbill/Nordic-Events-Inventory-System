"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { deleteBoxAction } from "../../boxes/actions";

/** Empty boxes at a location, each with a discard button. */
export function EmptyBoxes({ boxes }: { boxes: { id: number; code: string; description: string | null }[] }) {
  const router = useRouter();
  return (
    <Card>
      <ul className="divide-y divide-gray-100">
        {boxes.map((b) => (
          <li key={b.id} className="flex items-center gap-2 px-4 py-2">
            <Link href={`/boxes/${b.code}`} className="min-w-0 flex-1">
              <span className="font-semibold">{b.code}</span>
              {b.description && <span className="block truncate text-sm text-gray-600">{b.description}</span>}
            </Link>
            <ActionButton
              variant="ghost"
              className="text-red-700"
              pendingText="…"
              confirm={`Discard ${b.code}? Its history is kept.`}
              action={async (): Promise<ActionResult> => {
                const r = await deleteBoxAction(b.id);
                if (r.ok) router.refresh();
                return r;
              }}
            >
              Discard
            </ActionButton>
          </li>
        ))}
      </ul>
    </Card>
  );
}
