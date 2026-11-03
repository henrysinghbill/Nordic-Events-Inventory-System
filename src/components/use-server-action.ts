"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

export const NETWORK_ERROR =
  "Couldn't reach the server, so this may not have been saved. Check your signal and tap the button again — your entries are kept.";

/**
 * Call a Server Action with:
 *  - protection against double taps (a second call while one is running is ignored);
 *  - a clear message if the network fails (never silent);
 *  - field errors from the server kept in state.
 */
export function useServerAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<ActionResult<T>>,
) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (...args: Args): Promise<ActionResult<T> | null> => {
      if (busy.current) return null;
      busy.current = true;
      setPending(true);
      setError(null);
      setFieldErrors({});
      try {
        const result = await action(...args);
        // An action that redirects (e.g. session expired) resolves without a result.
        if (!result) return null;
        if (!result.ok) {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
        }
        return result;
      } catch {
        const message =
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "You're offline, so this wasn't saved. Your entries are kept — try again when you have signal."
            : NETWORK_ERROR;
        setError(message);
        return { ok: false, error: message };
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, fieldErrors, setError };
}

/** Id sent with stock-changing requests so a retry can't apply the change twice. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
