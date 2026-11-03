import "server-only";
import type { AuthProvider } from "../provider";

/**
 * ============================================================================
 *  NORDIC VMS LOGIN PROVIDER  —  STUB, TO BE IMPLEMENTED BY OLIVER
 * ============================================================================
 *
 * Enable with AUTH_PROVIDER=vms. Until this is implemented, every login
 * attempt fails with a clear message.
 *
 * WHAT YOU RECEIVE
 *   username: what the person typed, with surrounding spaces removed
 *             (original case kept; the app itself matches users case-insensitively)
 *   password: exactly what the person typed
 *
 * WHAT YOU MUST RETURN
 *   Correct credentials:   { ok: true, displayName?: string, email?: string }
 *                          displayName is shown in the app and in the history log.
 *   Wrong credentials:     { ok: false }
 *   VMS unreachable/error: { ok: false, error: "Can't reach VMS right now. Try again." }
 *                          Don't throw; the app shows `error` to the person.
 *
 * WHAT HAPPENS AFTERWARDS (already handled, nothing to do here)
 *   - First successful login creates a User row with the "member" role.
 *   - Admins promote/demote/deactivate users on the Users page.
 *   - A deactivated user is refused even if VMS says the password is correct.
 *   - The first admin is the user named INITIAL_ADMIN_USERNAME (see DEPLOY.md).
 *
 * TODO(VMS): Replace the body of verifyCredentials with a real check. Typical options:
 *
 *   1. LDAP / Active Directory — e.g. with the `ldapts` package:
 *        const client = new Client({ url: process.env.VMS_LDAP_URL });
 *        try {
 *          await client.bind(`${username}@nordic.local`, password);  // or a DN
 *          // optionally search for the user's displayName / mail attributes
 *          return { ok: true, displayName, email };
 *        } catch (e) {
 *          if (e instanceof InvalidCredentialsError) return { ok: false };
 *          return { ok: false, error: "Can't reach VMS right now. Try again." };
 *        } finally { await client.unbind(); }
 *
 *   2. An HTTP login API on VMS:
 *        const res = await fetch(process.env.VMS_AUTH_URL!, {
 *          method: "POST",
 *          headers: { "Content-Type": "application/json" },
 *          body: JSON.stringify({ username, password }),
 *          signal: AbortSignal.timeout(10_000),
 *        });
 *        if (res.status === 401) return { ok: false };
 *        if (!res.ok) return { ok: false, error: "VMS login failed. Try again." };
 *        const body = await res.json();
 *        return { ok: true, displayName: body.name, email: body.email };
 *
 *   3. Direct database lookup — query the VMS user table and verify the stored
 *      hash with the same algorithm VMS uses.
 *
 *   Add any new settings (VMS_LDAP_URL etc.) to .env.example and DEPLOY.md.
 */
export const vmsProvider: AuthProvider = {
  id: "vms",
  managesPasswords: false,
  async verifyCredentials(_username, _password) {
    // TODO(VMS): implement — see the comment above.
    return {
      ok: false,
      error: "VMS login has not been connected yet. Ask your administrator.",
    };
  },
};
