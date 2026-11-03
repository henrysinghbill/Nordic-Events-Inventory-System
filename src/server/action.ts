import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { UserError } from "./errors";

/**
 * Wrap the body of every Server Action. Expected problems (UserError) become a
 * clear message; anything unexpected is logged and reported without details.
 * Redirects (e.g. "please sign in") pass through untouched.
 */
export async function safeAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) {
      return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    }
    console.error("[action] Unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on the server, so the change was not saved. Please try again.",
    };
  }
}

/** Read a FormData into a plain object (repeated keys become arrays). */
export function formToObject(form: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}
