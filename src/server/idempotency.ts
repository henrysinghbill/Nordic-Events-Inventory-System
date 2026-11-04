import type { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "./db";
import { isUniqueViolation } from "./errors";

/**
 * Run a stock-changing transaction at most once per request id.
 *
 * On weak signal, a request can reach the server and succeed while the reply
 * is lost; the user then taps "Retry". The client sends the same request id
 * again, and we return the first result instead of adding stock twice.
 *
 * `replayed` is true when the work had already been done by an earlier request.
 */
export async function runOnce<T extends Prisma.InputJsonValue>(
  db: Db,
  userId: number,
  requestId: string | undefined | null,
  work: (tx: Tx) => Promise<T>,
  /** e.g. a longer timeout for big bulk saves (default 5 s). */
  txOptions?: { timeout?: number },
): Promise<{ result: T; replayed: boolean }> {
  if (!requestId) return { result: await db.$transaction(work, txOptions), replayed: false };
  const id = `${userId}:${requestId}`;

  const previous = await db.processedRequest.findUnique({ where: { id } });
  if (previous) return { result: previous.result as T, replayed: true };

  try {
    const result = await db.$transaction(async (tx) => {
      const value = await work(tx);
      await tx.processedRequest.create({ data: { id, userId, result: value } });
      return value;
    }, txOptions);
    return { result, replayed: false };
  } catch (err) {
    // The same request ran concurrently and won; its changes are kept, ours rolled back.
    if (isUniqueViolation(err)) {
      const winner = await db.processedRequest.findUnique({ where: { id } });
      if (winner) return { result: winner.result as T, replayed: true };
    }
    throw err;
  }
}

/** Old request ids are only needed for a short while. */
export async function pruneProcessedRequests(db: Db, olderThanDays = 7) {
  await db.processedRequest.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - olderThanDays * 86_400_000) } },
  });
}
