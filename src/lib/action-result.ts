/**
 * Every Server Action returns one of these, so the UI can always tell the user
 * clearly whether it worked. (Network failures are handled in the client.)
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
