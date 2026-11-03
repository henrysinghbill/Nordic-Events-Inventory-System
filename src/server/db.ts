import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;
/** A Prisma transaction client (what `db.$transaction(async (tx) => …)` gives you). */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient(process.env.DATABASE_URL ?? "");

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
