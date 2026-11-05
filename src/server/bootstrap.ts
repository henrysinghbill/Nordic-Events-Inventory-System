import "server-only";
import { hashPassword } from "./auth/providers/local";
import { config } from "./config";
import { db } from "./db";
import { pruneProcessedRequests } from "./idempotency";

const SEED_COMPANIES = [
  "Nordic Laboratories",
  "Functional Future",
  "Nordic Health",
  "DNA Life",
  "Simply Nature",
];

/**
 * Runs once when the server starts (see src/instrumentation.ts).
 *  - Seeds the starting companies and the Copenhagen storeroom, only ever once
 *    (so deleting them later doesn't make them come back).
 *  - Creates the initial admin if that user doesn't exist yet (see ensureInitialAdmin).
 */
export async function bootstrap() {
  await pruneProcessedRequests(db);

  const seeded = await db.appSetting.findUnique({ where: { key: "initial_data_seeded" } });
  if (!seeded) {
    await db.$transaction(async (tx) => {
      for (const name of SEED_COMPANIES) {
        await tx.company.upsert({ where: { name }, create: { name }, update: {} });
      }
      await tx.location.upsert({
        where: { name: "Copenhagen storeroom" },
        create: { name: "Copenhagen storeroom", country: "Denmark", type: "STORAGE" },
        update: {},
      });
      await tx.appSetting.create({ data: { key: "initial_data_seeded", value: new Date().toISOString() } });
    });
    console.log("[bootstrap] Seeded companies and the Copenhagen storeroom.");
  }

  await ensureInitialAdmin();
}

/**
 * Make sure the initial administrator exists: if no user with the name
 * INITIAL_ADMIN_USERNAME exists yet, create it as an administrator.
 *
 * This runs on every start, so it also works when switching an existing
 * database to VMS logins: set INITIAL_ADMIN_USERNAME to your VMS username and
 * restart. An existing user is never changed (so an admin who was later made a
 * member, or deactivated, stays that way).
 */
export async function ensureInitialAdmin(client = db) {
  const cfg = config();
  const username = cfg.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  if (!username) {
    if ((await client.user.count()) === 0) {
      console.warn("[bootstrap] No users exist and INITIAL_ADMIN_USERNAME is not set. Nobody can sign in as admin.");
    }
    return null;
  }
  if (await client.user.findUnique({ where: { username } })) return null;

  const needsPassword = cfg.AUTH_PROVIDER === "local";
  if (needsPassword && !cfg.INITIAL_ADMIN_PASSWORD) {
    console.warn("[bootstrap] INITIAL_ADMIN_PASSWORD is not set, so the initial admin can't sign in with the local provider.");
  }
  const user = await client.user.create({
    data: {
      username,
      displayName: username,
      role: "ADMIN",
      passwordHash: needsPassword && cfg.INITIAL_ADMIN_PASSWORD ? await hashPassword(cfg.INITIAL_ADMIN_PASSWORD) : null,
    },
  });
  console.log(`[bootstrap] Created initial admin "${username}".`);
  return user;
}
