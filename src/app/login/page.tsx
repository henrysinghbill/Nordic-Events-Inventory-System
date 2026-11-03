import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton, TextInput } from "@/components/action-form";
import { BoxIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";
import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/";
  if (await getCurrentUser()) redirect(nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/");

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-brand-600 p-2 text-white">
            <BoxIcon />
          </div>
          <div>
            <h1 className="text-xl font-bold">Events Inventory</h1>
            <p className="text-sm text-gray-600">Nordic Group</p>
          </div>
        </div>
        <ActionForm action={loginAction}>
          <input type="hidden" name="next" value={nextPath} />
          <Field label="Username" name="username">
            <TextInput
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
            />
          </Field>
          <Field label="Password" name="password">
            <TextInput name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </ActionForm>
      </Card>
    </main>
  );
}
