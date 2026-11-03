import "server-only";
/**
 * ============================================================================
 *  LOGIN PROVIDER INTERFACE  —  the only place passwords are checked.
 * ============================================================================
 *
 * The app never checks a password itself. It asks the active provider:
 *
 *     verifyCredentials(username, password) → { ok, displayName?, email? }
 *
 * The provider is chosen with the AUTH_PROVIDER environment variable:
 *     AUTH_PROVIDER=local  →  ./providers/local.ts  (passwords stored in this app)
 *     AUTH_PROVIDER=vms    →  ./providers/vms.ts    (Nordic VMS — to be implemented)
 *
 * Roles (admin / member) are NOT the provider's business: they are always stored
 * in this app's own User table, matched by username. See DEPLOY.md,
 * "Connecting VMS logins".
 */
import { config } from "../config";
import { localProvider } from "./providers/local";
import { vmsProvider } from "./providers/vms";

export type VerifyResult =
  | {
      ok: true;
      /** Name to show in the app. Optional; falls back to the username. */
      displayName?: string;
      /** Optional; stored for reference only. */
      email?: string;
    }
  | {
      ok: false;
      /**
       * Set only for problems that are NOT "wrong username or password",
       * e.g. "VMS is unreachable". Shown to the user as-is.
       */
      error?: string;
    };

export interface AuthProvider {
  readonly id: "local" | "vms";
  /**
   * True if this app stores the passwords (local provider). Controls whether
   * admins see "Create user" and "Reset password" on the Users page.
   */
  readonly managesPasswords: boolean;
  /**
   * Check a username and password.
   * @param username exactly as typed, with surrounding spaces removed
   * @param password exactly as typed
   * Must not throw for wrong credentials — return { ok: false } instead.
   */
  verifyCredentials(username: string, password: string): Promise<VerifyResult>;
}

export function authProvider(): AuthProvider {
  return config().AUTH_PROVIDER === "vms" ? vmsProvider : localProvider;
}
