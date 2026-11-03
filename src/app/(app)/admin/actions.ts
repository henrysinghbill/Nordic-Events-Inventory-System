"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { safeAction } from "@/server/action";
import {
  archiveLocation,
  companyNameSchema,
  createCompany,
  createLocalUser,
  createLocation,
  locationSchema,
  passwordSchema,
  removeCompany,
  renameCompany,
  restoreCompany,
  restoreLocation,
  setLocalPassword,
  setUserActive,
  setUserRole,
  updateLocation,
  usernameSchema,
} from "@/server/admin";
import { authProvider } from "@/server/auth/provider";
import { hashPassword } from "@/server/auth/providers/local";
import { requireAdmin, toActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { parseInput, UserError } from "@/server/errors";

/** Run an admin-only change in a transaction, then refresh the page. */
async function adminChange(
  work: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], actor: ReturnType<typeof toActor>) => Promise<unknown>,
  message: string,
): Promise<ActionResult> {
  return safeAction(async () => {
    const admin = await requireAdmin();
    await db.$transaction((tx) => work(tx, toActor(admin)));
    refresh();
    return { ok: true, message };
  });
}

// ---------------------------------------------------------------- companies

export async function createCompanyAction(form: FormData) {
  return safeAction(async () => {
    const name = parseInput(z.object({ name: companyNameSchema }), { name: form.get("name") }).name;
    return adminChange((tx, actor) => createCompany(tx, actor, name), `Added "${name}".`);
  });
}

export async function renameCompanyAction(id: number, form: FormData) {
  return safeAction(async () => {
    const name = parseInput(z.object({ name: companyNameSchema }), { name: form.get("name") }).name;
    return adminChange((tx, actor) => renameCompany(tx, actor, id, name), "Company renamed.");
  });
}

export async function removeCompanyAction(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const admin = await requireAdmin();
    const outcome = await db.$transaction((tx) => removeCompany(tx, toActor(admin), id));
    refresh();
    return {
      ok: true,
      message:
        outcome === "archived"
          ? "Company archived: items are still tagged with it, so it's hidden from pickers but kept in history."
          : "Company deleted.",
    };
  });
}

export async function restoreCompanyAction(id: number) {
  return adminChange((tx, actor) => restoreCompany(tx, actor, id), "Company restored.");
}

// ---------------------------------------------------------------- locations

function locationFrom(form: FormData) {
  return parseInput(locationSchema, {
    name: form.get("name"),
    country: form.get("country"),
    type: form.get("type"),
    notes: form.get("notes"),
  });
}

export async function createLocationAction(form: FormData) {
  return safeAction(async () => {
    const input = locationFrom(form);
    return adminChange((tx, actor) => createLocation(tx, actor, input), `Added "${input.name}".`);
  });
}

export async function updateLocationAction(id: number, form: FormData) {
  return safeAction(async () => {
    const input = locationFrom(form);
    return adminChange((tx, actor) => updateLocation(tx, actor, id, input), "Location saved.");
  });
}

export async function archiveLocationAction(id: number) {
  return adminChange((tx, actor) => archiveLocation(tx, actor, id), "Location archived.");
}

export async function restoreLocationAction(id: number) {
  return adminChange((tx, actor) => restoreLocation(tx, actor, id), "Location restored.");
}

// ---------------------------------------------------------------- users

export async function setUserRoleAction(id: number, role: "ADMIN" | "MEMBER") {
  return adminChange((tx, actor) => setUserRole(tx, actor, id, role), "Role changed.");
}

export async function setUserActiveAction(id: number, active: boolean) {
  return adminChange(
    (tx, actor) => setUserActive(tx, actor, id, active),
    active ? "User reactivated." : "User deactivated and signed out.",
  );
}

function requireLocalProvider() {
  if (!authProvider().managesPasswords) {
    throw new UserError("Passwords are managed by VMS, not by this app.");
  }
}

export async function createUserAction(form: FormData) {
  return safeAction(async () => {
    requireLocalProvider();
    const input = parseInput(
      z.object({
        username: usernameSchema,
        displayName: z.string().trim().min(1, "Enter a name.").max(100),
        role: z.enum(["ADMIN", "MEMBER"]),
        password: passwordSchema,
      }),
      {
        username: form.get("username"),
        displayName: form.get("displayName"),
        role: form.get("role"),
        password: form.get("password"),
      },
    );
    const passwordHash = await hashPassword(input.password);
    return adminChange(
      (tx, actor) =>
        createLocalUser(tx, actor, {
          username: input.username,
          displayName: input.displayName,
          role: input.role,
          passwordHash,
        }),
      `User "${input.username}" created.`,
    );
  });
}

export async function resetPasswordAction(id: number, form: FormData) {
  return safeAction(async () => {
    requireLocalProvider();
    const { password } = parseInput(z.object({ password: passwordSchema }), { password: form.get("password") });
    const passwordHash = await hashPassword(password);
    return adminChange((tx, actor) => setLocalPassword(tx, actor, id, passwordHash), "Password changed.");
  });
}
