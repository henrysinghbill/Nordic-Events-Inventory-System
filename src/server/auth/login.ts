import "server-only";
import { db } from "../db";
import { authProvider } from "./provider";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "./rate-limit";
import { createSession } from "./session";

export type SignInResult = { ok: true } | { ok: false; error: string };

const WRONG = "Wrong username or password.";

/**
 * Check credentials with the active provider, then find or create the user in
 * our own table (roles live here) and start a session.
 */
export async function signIn(rawUsername: string, password: string, ip: string): Promise<SignInResult> {
  const username = rawUsername.trim();
  if (!username || !password) return { ok: false, error: "Enter your username and password." };

  const wait = loginBlocked(ip, username);
  if (wait) {
    return { ok: false, error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };
  }

  const result = await authProvider().verifyCredentials(username, password);
  if (!result.ok) {
    if (result.error) return { ok: false, error: result.error }; // provider problem, not a wrong password
    recordLoginFailure(ip, username);
    return { ok: false, error: WRONG };
  }

  const key = username.toLowerCase();
  let user = await db.user.findUnique({ where: { username: key } });
  if (!user) {
    // First sign-in (VMS): create the user as a member.
    user = await db.user.create({
      data: {
        username: key,
        displayName: result.displayName?.trim() || username,
        email: result.email ?? null,
        role: "MEMBER",
      },
    });
  }
  if (!user.active) {
    return { ok: false, error: "Your account has been deactivated. Ask an administrator." };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      // Keep name/email in sync with the provider when it supplies them.
      ...(result.displayName?.trim() ? { displayName: result.displayName.trim() } : {}),
      ...(result.email ? { email: result.email } : {}),
    },
  });
  clearLoginFailures(ip, username);
  await createSession(user.id);
  return { ok: true };
}
