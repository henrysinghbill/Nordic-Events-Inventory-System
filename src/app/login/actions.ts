"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { signIn } from "@/server/auth/login";
import { destroySession } from "@/server/auth/session";
import { safeAction } from "@/server/action";

/** Only allow redirects back to our own pages (never to another site). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function loginAction(form: FormData): Promise<ActionResult> {
  const result = await safeAction(async () => {
    const res = await signIn(String(form.get("username") ?? ""), String(form.get("password") ?? ""), await clientIp());
    return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
  });
  if (result.ok) redirect(safeNext(form.get("next")));
  return result;
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
