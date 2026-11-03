"use client";

import type { ComponentProps } from "react";
import type { ActionResult } from "@/lib/action-result";
import { useToast } from "./toast";
import { Button } from "./ui";
import { useServerAction } from "./use-server-action";

/**
 * A button that runs a Server Action, with an optional confirmation question.
 * Success shows a toast; failure shows an error toast that stays until dismissed.
 */
export function ActionButton({
  action,
  confirm: question,
  children,
  pendingText = "Working…",
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<ActionResult<unknown>>;
  confirm?: string;
  pendingText?: string;
}) {
  const toast = useToast();
  const { run, pending } = useServerAction(action);
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={async () => {
        if (question && !window.confirm(question)) return;
        const result = await run();
        if (!result) return;
        if (result.ok) toast("success", result.message ?? "Done.");
        else toast("error", result.error);
      }}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
