import { createPrismaClient } from "@/server/db";
import type { Actor } from "@/server/history";

export const testDb = createPrismaClient(process.env.DATABASE_URL!);

/** Empty every table (except Prisma's migration log) and reset id counters. */
export async function resetDb() {
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await testDb.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/** Common starting point: a user, two companies, a storage location and a venue. */
export async function seedBasics() {
  const user = await testDb.user.create({
    data: { username: "tester", displayName: "Test User", role: "ADMIN" },
  });
  const actor: Actor = { id: user.id, displayName: user.displayName };
  const nl = await testDb.company.create({ data: { name: "Nordic Laboratories" } });
  const ff = await testDb.company.create({ data: { name: "Functional Future" } });
  const cph = await testDb.location.create({
    data: { name: "Copenhagen storeroom", country: "Denmark", type: "STORAGE" },
  });
  const venue = await testDb.location.create({
    data: { name: "Vitafoods Barcelona", country: "Spain", type: "VENUE" },
  });
  return { actor, nl, ff, cph, venue };
}

export async function makeItem(name: string, companyId: number) {
  return testDb.item.create({ data: { name, companies: { create: [{ companyId }] } } });
}

export async function looseQty(itemId: number, locationId: number) {
  const h = await testDb.holding.findUnique({ where: { itemId_locationId: { itemId, locationId } } });
  return h?.quantity ?? 0;
}
