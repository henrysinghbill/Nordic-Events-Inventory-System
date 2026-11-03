/**
 * Admin changes: companies, locations and users. Each function takes a
 * transaction and logs to history, like the stock module.
 */
import { z } from "zod";
import { plural } from "@/lib/format";
import type { Tx } from "./db";
import { UserError } from "./errors";
import { logHistory, type Actor } from "./history";

// ---------------------------------------------------------------- companies

export const companyNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(100, "Keep the name under 100 characters.");

async function assertCompanyNameFree(tx: Tx, name: string, exceptId?: number) {
  const clash = await tx.company.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) {
    throw new UserError(
      clash.archivedAt ? `"${clash.name}" already exists (archived). Restore it instead.` : `"${clash.name}" already exists.`,
      { name: "That name is already used." },
    );
  }
}

export async function createCompany(tx: Tx, actor: Actor, name: string) {
  await assertCompanyNameFree(tx, name);
  const company = await tx.company.create({ data: { name } });
  await logHistory(tx, actor, { action: "COMPANY_CREATED", summary: `Company "${name}" added`, companyId: company.id });
  return company;
}

export async function renameCompany(tx: Tx, actor: Actor, id: number, name: string) {
  const company = await tx.company.findUnique({ where: { id } });
  if (!company) throw new UserError("That company doesn't exist.");
  if (company.name === name) return company;
  await assertCompanyNameFree(tx, name, id);
  const updated = await tx.company.update({ where: { id }, data: { name } });
  await logHistory(tx, actor, {
    action: "COMPANY_RENAMED",
    summary: `Company "${company.name}" renamed to "${name}"`,
    companyId: id,
  });
  return updated;
}

/**
 * Remove a company: archived if any item is tagged with it (history kept),
 * deleted outright if nothing is attached.
 */
export async function removeCompany(tx: Tx, actor: Actor, id: number): Promise<"archived" | "deleted"> {
  const company = await tx.company.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
  if (!company) throw new UserError("That company doesn't exist.");
  if (company._count.items > 0) {
    await tx.company.update({ where: { id }, data: { archivedAt: new Date() } });
    await logHistory(tx, actor, {
      action: "COMPANY_ARCHIVED",
      summary: `Company "${company.name}" archived (${plural(company._count.items, "item")} still tagged)`,
      companyId: id,
    });
    return "archived";
  }
  await tx.company.delete({ where: { id } });
  await logHistory(tx, actor, { action: "COMPANY_DELETED", summary: `Company "${company.name}" deleted`, companyId: id });
  return "deleted";
}

export async function restoreCompany(tx: Tx, actor: Actor, id: number) {
  const company = await tx.company.update({ where: { id }, data: { archivedAt: null } });
  await logHistory(tx, actor, { action: "COMPANY_RESTORED", summary: `Company "${company.name}" restored`, companyId: id });
}

// ---------------------------------------------------------------- locations

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100, "Keep the name under 100 characters."),
  country: z.string().trim().min(1, "Enter a country.").max(60),
  type: z.enum(["STORAGE", "VENUE"], { message: "Choose storage or event venue." }),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((s) => (s === "" ? null : s))
    .nullish(),
});
export type LocationInput = z.infer<typeof locationSchema>;

async function assertLocationNameFree(tx: Tx, name: string, exceptId?: number) {
  const clash = await tx.location.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) throw new UserError(`A location called "${clash.name}" already exists.`, { name: "That name is already used." });
}

const typeLabel = (t: "STORAGE" | "VENUE") => (t === "STORAGE" ? "storage" : "event venue");

export async function createLocation(tx: Tx, actor: Actor, input: LocationInput) {
  await assertLocationNameFree(tx, input.name);
  const location = await tx.location.create({ data: { ...input, notes: input.notes ?? null } });
  await logHistory(tx, actor, {
    action: "LOCATION_CREATED",
    summary: `Location "${location.name}" (${location.country}, ${typeLabel(location.type)}) added`,
    locationId: location.id,
  });
  return location;
}

export async function updateLocation(tx: Tx, actor: Actor, id: number, input: LocationInput) {
  const before = await tx.location.findUnique({ where: { id } });
  if (!before) throw new UserError("That location doesn't exist.");
  await assertLocationNameFree(tx, input.name, id);
  const after = await tx.location.update({ where: { id }, data: { ...input, notes: input.notes ?? null } });
  const changes: string[] = [];
  if (before.name !== after.name) changes.push(`renamed from "${before.name}"`);
  if (before.country !== after.country) changes.push(`country ${before.country} → ${after.country}`);
  if (before.type !== after.type) changes.push(`now ${typeLabel(after.type)}`);
  if ((before.notes ?? "") !== (after.notes ?? "")) changes.push("notes changed");
  if (changes.length) {
    await logHistory(tx, actor, {
      action: "LOCATION_EDITED",
      summary: `Location "${after.name}" edited: ${changes.join("; ")}`,
      locationId: id,
    });
  }
  return after;
}

/** Archive a location — only allowed when nothing is there or on its way there/from there. */
export async function archiveLocation(tx: Tx, actor: Actor, id: number) {
  const location = await tx.location.findUnique({ where: { id } });
  if (!location) throw new UserError("That location doesn't exist.");
  const [loose, boxesHere, boxesMoving] = await Promise.all([
    tx.holding.count({ where: { locationId: id } }),
    tx.box.count({ where: { locationId: id, deletedAt: null } }),
    tx.box.count({
      where: { status: "IN_TRANSIT", deletedAt: null, OR: [{ originId: id }, { destinationId: id }] },
    }),
  ]);
  if (loose || boxesHere || boxesMoving) {
    const parts = [
      loose && `${loose} loose item${loose === 1 ? "" : "s"}`,
      boxesHere && `${boxesHere} box${boxesHere === 1 ? "" : "es"}`,
      boxesMoving && `${boxesMoving} box${boxesMoving === 1 ? "" : "es"} in transit to or from it`,
    ].filter(Boolean);
    throw new UserError(`${location.name} can't be archived while it has ${parts.join(", ")}. Move or remove them first.`);
  }
  await tx.location.update({ where: { id }, data: { archivedAt: new Date() } });
  await logHistory(tx, actor, { action: "LOCATION_ARCHIVED", summary: `Location "${location.name}" archived`, locationId: id });
}

export async function restoreLocation(tx: Tx, actor: Actor, id: number) {
  const location = await tx.location.update({ where: { id }, data: { archivedAt: null } });
  await logHistory(tx, actor, { action: "LOCATION_RESTORED", summary: `Location "${location.name}" restored`, locationId: id });
}

// ---------------------------------------------------------------- users

export const usernameSchema = z
  .string()
  .trim()
  .min(2, "Usernames need at least 2 characters.")
  .max(100)
  .regex(/^[A-Za-z0-9._@-]+$/, "Use letters, numbers and . _ @ - only.")
  .transform((s) => s.toLowerCase());

export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(200);

async function activeAdminCount(tx: Tx) {
  return tx.user.count({ where: { role: "ADMIN", active: true } });
}

export async function setUserRole(tx: Tx, actor: Actor, id: number, role: "ADMIN" | "MEMBER") {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user) throw new UserError("That user doesn't exist.");
  if (user.role === role) return;
  if (role === "MEMBER" && user.role === "ADMIN" && user.active && (await activeAdminCount(tx)) <= 1) {
    throw new UserError("There must always be at least one active administrator.");
  }
  await tx.user.update({ where: { id }, data: { role } });
  await logHistory(tx, actor, {
    action: "USER_CHANGED",
    summary: `${user.displayName} (${user.username}) ${role === "ADMIN" ? "made an administrator" : "changed to member"}`,
  });
}

export async function setUserActive(tx: Tx, actor: Actor, id: number, active: boolean) {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user) throw new UserError("That user doesn't exist.");
  if (user.active === active) return;
  if (!active && id === actor.id) throw new UserError("You can't deactivate yourself.");
  if (!active && user.role === "ADMIN" && (await activeAdminCount(tx)) <= 1) {
    throw new UserError("There must always be at least one active administrator.");
  }
  await tx.user.update({ where: { id }, data: { active } });
  if (!active) await tx.session.deleteMany({ where: { userId: id } }); // signs them out everywhere now
  await logHistory(tx, actor, {
    action: "USER_CHANGED",
    summary: `${user.displayName} (${user.username}) ${active ? "reactivated" : "deactivated"}`,
  });
}

export async function createLocalUser(
  tx: Tx,
  actor: Actor,
  input: { username: string; displayName: string; role: "ADMIN" | "MEMBER"; passwordHash: string },
) {
  if (await tx.user.findUnique({ where: { username: input.username } })) {
    throw new UserError(`The username "${input.username}" is already taken.`, { username: "Already taken." });
  }
  const user = await tx.user.create({ data: input });
  await logHistory(tx, actor, {
    action: "USER_CHANGED",
    summary: `User ${user.displayName} (${user.username}) created as ${user.role === "ADMIN" ? "administrator" : "member"}`,
  });
  return user;
}

export async function setLocalPassword(tx: Tx, actor: Actor, id: number, passwordHash: string) {
  const user = await tx.user.update({ where: { id }, data: { passwordHash } });
  // Sign the user out on all devices (but don't sign out the admin doing it to themselves).
  if (id !== actor.id) await tx.session.deleteMany({ where: { userId: id } });
  await logHistory(tx, actor, {
    action: "USER_CHANGED",
    summary: `Password reset for ${user.displayName} (${user.username})`,
  });
}
