import { beforeEach, describe, expect, it } from "vitest";
import { archiveLocation, createCompany, removeCompany, setUserActive, setUserRole } from "@/server/admin";
import { addStock } from "@/server/stock";
import { makeItem, resetDb, seedBasics, testDb } from "./helpers/db";

let s: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb();
  s = await seedBasics();
});

describe("companies", () => {
  it("deletes a company nothing is tagged with", async () => {
    const c = await testDb.$transaction((tx) => createCompany(tx, s.actor, "Test Brand"));
    expect(await testDb.$transaction((tx) => removeCompany(tx, s.actor, c.id))).toBe("deleted");
    expect(await testDb.company.findUnique({ where: { id: c.id } })).toBeNull();
  });

  it("archives (not deletes) a company that items are tagged with", async () => {
    await makeItem("Tote bag", s.nl.id);
    expect(await testDb.$transaction((tx) => removeCompany(tx, s.actor, s.nl.id))).toBe("archived");
    const c = await testDb.company.findUniqueOrThrow({ where: { id: s.nl.id } });
    expect(c.archivedAt).not.toBeNull();
    expect(await testDb.itemCompany.count({ where: { companyId: s.nl.id } })).toBe(1);
  });

  it("refuses duplicate names regardless of case", async () => {
    await expect(testDb.$transaction((tx) => createCompany(tx, s.actor, "nordic laboratories"))).rejects.toThrow(
      /already exists/,
    );
  });
});

describe("locations", () => {
  it("can't archive a location that still has stock", async () => {
    const item = await makeItem("Tote bag", s.nl.id);
    await testDb.$transaction((tx) =>
      addStock(tx, s.actor, { itemId: item.id, quantity: 1, place: { locationId: s.cph.id } }),
    );
    await expect(testDb.$transaction((tx) => archiveLocation(tx, s.actor, s.cph.id))).rejects.toThrow(
      /can't be archived/,
    );
  });

  it("can't archive a location with a box on its way there", async () => {
    await testDb.box.create({ data: { status: "IN_TRANSIT", originId: s.cph.id, destinationId: s.venue.id } });
    await expect(testDb.$transaction((tx) => archiveLocation(tx, s.actor, s.venue.id))).rejects.toThrow(/in transit/);
  });

  it("archives an empty location", async () => {
    await testDb.$transaction((tx) => archiveLocation(tx, s.actor, s.venue.id));
    expect((await testDb.location.findUniqueOrThrow({ where: { id: s.venue.id } })).archivedAt).not.toBeNull();
  });
});

describe("users", () => {
  it("always keeps at least one active admin", async () => {
    await expect(testDb.$transaction((tx) => setUserRole(tx, s.actor, s.actor.id, "MEMBER"))).rejects.toThrow(
      /at least one active administrator/,
    );
  });

  it("deactivating a user signs them out everywhere", async () => {
    const anna = await testDb.user.create({ data: { username: "anna", displayName: "Anna" } });
    await testDb.session.create({ data: { id: "s1", userId: anna.id, expiresAt: new Date(Date.now() + 1e9) } });
    await testDb.$transaction((tx) => setUserActive(tx, s.actor, anna.id, false));
    expect(await testDb.session.count({ where: { userId: anna.id } })).toBe(0);
  });

  it("you can't deactivate yourself", async () => {
    await expect(testDb.$transaction((tx) => setUserActive(tx, s.actor, s.actor.id, false))).rejects.toThrow(
      /yourself/,
    );
  });
});
