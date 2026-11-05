import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { resetDb, testDb } from "./helpers/db";

// Settings as on the VMS server: logins checked by VMS, the first admin named by VMS username.
process.env.AUTH_PROVIDER = "vms";
process.env.INITIAL_ADMIN_USERNAME = "Oliver.Hansen";
delete process.env.INITIAL_ADMIN_PASSWORD;

const { ensureInitialAdmin } = await import("@/server/bootstrap");
const db = testDb as unknown as Db;

beforeEach(resetDb);

describe("ensureInitialAdmin", () => {
  it("creates the named admin even when other users already exist (switching to VMS)", async () => {
    await testDb.user.create({ data: { username: "admin", displayName: "Old local admin", role: "ADMIN", passwordHash: "x" } });
    const created = await ensureInitialAdmin(db);
    expect(created).toMatchObject({ username: "oliver.hansen", role: "ADMIN", passwordHash: null });
  });

  it("never changes an existing user", async () => {
    await testDb.user.create({ data: { username: "oliver.hansen", displayName: "Oliver", role: "MEMBER", active: false } });
    expect(await ensureInitialAdmin(db)).toBeNull();
    expect(await testDb.user.findUniqueOrThrow({ where: { username: "oliver.hansen" } })).toMatchObject({ role: "MEMBER", active: false });
  });
});
