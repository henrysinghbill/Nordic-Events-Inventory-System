import type { HistoryAction } from "@/generated/prisma/enums";
import type { Tx } from "./db";

/** The person doing something. Passed into every function that changes data. */
export type Actor = { id: number; displayName: string };

export type HistoryInput = {
  action: HistoryAction;
  /** Human-readable sentence with names copied in, e.g. "50 × Tote bag unpacked from BOX-0012". */
  summary: string;
  itemId?: number | null;
  boxId?: number | null;
  locationId?: number | null;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  companyId?: number | null;
  quantity?: number | null;
  quantityBefore?: number | null;
  quantityAfter?: number | null;
  reason?: string | null;
  note?: string | null;
};

/**
 * Append an entry to the history log. Always call this inside the same
 * transaction as the change itself, so the log can never disagree with the data.
 */
export async function logHistory(tx: Tx, actor: Actor, entry: HistoryInput) {
  await tx.historyEntry.create({
    data: { ...entry, userId: actor.id, userName: actor.displayName },
  });
}
