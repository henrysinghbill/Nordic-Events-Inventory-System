import "server-only";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import type { AuthProvider } from "../provider";

/**
 * Local provider: usernames and bcrypt-hashed passwords stored in this app's
 * own User table. Used for development, testing and demos.
 */

// Compared against when the user doesn't exist, so a wrong username takes as
// long as a wrong password (doesn't reveal which usernames exist).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export const localProvider: AuthProvider = {
  id: "local",
  managesPasswords: true,
  async verifyCredentials(username, password) {
    const user = await db.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { passwordHash: true, displayName: true, email: true },
    });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!ok || !user?.passwordHash) return { ok: false };
    return { ok: true, displayName: user.displayName, email: user.email ?? undefined };
  },
};
