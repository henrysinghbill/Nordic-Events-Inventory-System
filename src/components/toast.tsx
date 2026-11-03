"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";

type Toast = { id: number; kind: "success" | "error"; message: string };
const ToastContext = createContext<(kind: Toast["kind"], message: string) => void>(() => {});

/** Short confirmations ("Saved"). Errors stay until dismissed, so they can't be missed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (kind: Toast["kind"], message: string) => {
      const id = Date.now() + Math.random();
      setToasts((ts) => [...ts.slice(-2), { id, kind, message }]);
      if (kind === "success") setTimeout(() => dismiss(id), 3500);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 text-white shadow-lg " +
              (t.kind === "success" ? "bg-green-700" : "bg-red-700")
            }
          >
            {t.kind === "success" ? <CheckIcon className="mt-0.5 shrink-0" /> : <AlertIcon className="mt-0.5 shrink-0" />}
            <p className="flex-1 font-medium">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-2 p-2">
              <CloseIcon size={20} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
