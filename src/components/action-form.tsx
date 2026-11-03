"use client";

import { createContext, useContext, useRef, type ComponentProps, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { AlertIcon } from "./icons";
import { useToast } from "./toast";
import { Button, cx, inputClass } from "./ui";
import { newRequestId, useServerAction } from "./use-server-action";

type FormState = { pending: boolean; fieldErrors: Record<string, string> };
const FormContext = createContext<FormState>({ pending: false, fieldErrors: {} });
export const useFormState = () => useContext(FormContext);

/**
 * A form that submits to a Server Action without reloading the page.
 * - Inputs keep their values if saving fails, so the user can just retry.
 * - The submit button is disabled while saving (no double submissions).
 * - A `requestId` is sent; it stays the same across retries of the same
 *   submission and changes after a success.
 */
export function ActionForm<T>({
  action,
  children,
  successMessage,
  onSuccess,
  resetOnSuccess = false,
  className,
}: {
  action: (form: FormData) => Promise<ActionResult<T>>;
  children: ReactNode;
  successMessage?: string;
  onSuccess?: (result: { data?: T; message?: string }) => void;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const { run, pending, error, fieldErrors } = useServerAction(action);
  const toast = useToast();
  const requestId = useRef(newRequestId());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    data.set("requestId", requestId.current);
    const result = await run(data);
    if (result?.ok) {
      requestId.current = newRequestId();
      if (resetOnSuccess) formEl.reset();
      const message = result.message ?? successMessage;
      if (message) toast("success", message);
      onSuccess?.(result);
    }
  }

  return (
    <FormContext value={{ pending, fieldErrors }}>
      <form onSubmit={onSubmit} className={cx("space-y-4", className)} noValidate>
        {children}
        {error && <FormError message={error} />}
      </form>
    </FormContext>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-red-800 ring-1 ring-red-200">
      <AlertIcon className="mt-0.5 shrink-0" size={20} />
      <p className="font-medium">{message}</p>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant,
  className,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormState();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** Label + control + error message for a named field. */
export function Field({
  label,
  name,
  hint,
  children,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const { fieldErrors } = useFormState();
  const error = fieldErrors[name];
  return (
    <div>
      <label htmlFor={name} className="mb-1 block font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function TextInput(props: ComponentProps<"input"> & { name: string }) {
  const { fieldErrors } = useFormState();
  return (
    <input
      id={props.name}
      aria-invalid={Boolean(fieldErrors[props.name])}
      {...props}
      className={cx(inputClass, fieldErrors[props.name] && "border-red-500", props.className)}
    />
  );
}

export function SelectInput(props: ComponentProps<"select"> & { name: string }) {
  return <select id={props.name} {...props} className={cx(inputClass, props.className)} />;
}

export function TextArea(props: ComponentProps<"textarea"> & { name: string }) {
  return <textarea id={props.name} rows={3} {...props} className={cx(inputClass, "py-2", props.className)} />;
}
