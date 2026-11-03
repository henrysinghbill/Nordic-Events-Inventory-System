import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { config } from "../config";
import { db } from "../db";
import type { Actor } from "../history";

/**
 * Sessions are stored in the database. The browser gets a random token in an
 * httpOnly cookie; the database only stores an HMAC of it. Deactivating a user
 * deletes their sessions, so it takes effect immediately.
 */
export const SESSION_COOKIE = "nei_session";
const SESSION_DAYS = 30; // phones stay signed in; extended while in use
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHmac("sha256", config().SESSION_SECRET).update(token).digest("hex");
}

function cookieSecure(): boolean {
  return config().APP_BASE_URL.startsWith("https://");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: number;
  username: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
};

/** The signed-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const session = await db.session.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, displayName: true, role: true, active: true } },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  // Sliding expiry: extend the session at most once a day.
  if (Date.now() - session.lastSeenAt.getTime() > DAY_MS) {
    await db.session.update({
      where: { id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) },
    });
  }
  const { active: _active, ...user } = session.user;
  return user;
});

/** Path of the current page (set by src/proxy.ts), used to come back after login. */
async function currentPath(): Promise<string> {
  return (await headers()).get("x-pathname") ?? "/";
}

/** Use at the top of every page and Server Action. Redirects to login if needed. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(await currentPath())}`);
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/?denied=1");
  return user;
}

export function toActor(user: CurrentUser): Actor {
  return { id: user.id, displayName: user.displayName };
}
