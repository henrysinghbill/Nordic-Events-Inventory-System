"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, Field, SelectInput, SubmitButton, TextInput } from "@/components/action-form";
import { Badge, Button, Card } from "@/components/ui";
import { createUserAction, resetPasswordAction, setUserActiveAction, setUserRoleAction } from "../actions";

type U = {
  id: number;
  username: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  active: boolean;
  lastLogin: string | null;
  isMe: boolean;
};

export function CreateUser() {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Create user</Button>;
  return (
    <Card className="max-w-xl p-4">
      <ActionForm action={createUserAction} onSuccess={() => setOpen(false)}>
        <Field label="Username" name="username">
          <TextInput name="username" autoCapitalize="none" autoCorrect="off" autoComplete="off" />
        </Field>
        <Field label="Display name" name="displayName">
          <TextInput name="displayName" placeholder="e.g. Anna Jensen" />
        </Field>
        <Field label="Password" name="password" hint="At least 8 characters. Share it with the person securely.">
          <TextInput name="password" type="text" autoComplete="new-password" />
        </Field>
        <Field label="Role" name="role">
          <SelectInput name="role" defaultValue="MEMBER">
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Administrator</option>
          </SelectInput>
        </Field>
        <div className="flex gap-2">
          <SubmitButton>Create user</SubmitButton>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </ActionForm>
    </Card>
  );
}

export function UserRow({ user, managesPasswords }: { user: U; managesPasswords: boolean }) {
  const [resetting, setResetting] = useState(false);
  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {user.displayName}
            {user.role === "ADMIN" ? <Badge tone="brand">Admin</Badge> : <Badge>Member</Badge>}
            {!user.active && <Badge tone="red">Deactivated</Badge>}
            {user.isMe && <Badge tone="green">You</Badge>}
          </p>
          <p className="text-sm text-gray-600">
            {user.username} · {user.lastLogin ? `last sign-in ${user.lastLogin}` : "never signed in"}
          </p>
        </div>
        <div className="-ml-4 flex flex-wrap gap-1 sm:ml-0">
          {user.role === "MEMBER" ? (
            <ActionButton variant="ghost" action={setUserRoleAction.bind(null, user.id, "ADMIN")} confirm={`Make ${user.displayName} an administrator?`}>
              Make admin
            </ActionButton>
          ) : (
            <ActionButton variant="ghost" action={setUserRoleAction.bind(null, user.id, "MEMBER")} confirm={`Change ${user.displayName} to member?`}>
              Make member
            </ActionButton>
          )}
          {managesPasswords && (
            <Button variant="ghost" onClick={() => setResetting((v) => !v)}>
              Reset password
            </Button>
          )}
          {!user.isMe &&
            (user.active ? (
              <ActionButton
                variant="ghost"
                className="text-red-700"
                action={setUserActiveAction.bind(null, user.id, false)}
                confirm={`Deactivate ${user.displayName}? They will be signed out immediately.`}
              >
                Deactivate
              </ActionButton>
            ) : (
              <ActionButton variant="ghost" action={setUserActiveAction.bind(null, user.id, true)}>
                Reactivate
              </ActionButton>
            ))}
        </div>
      </div>
      {resetting && (
        <ActionForm
          action={resetPasswordAction.bind(null, user.id)}
          onSuccess={() => setResetting(false)}
          className="mt-3 flex items-start gap-2 space-y-0"
        >
          <div className="flex-1">
            <TextInput name="password" type="text" placeholder="New password (min. 8 characters)" autoComplete="new-password" aria-label="New password" />
          </div>
          <SubmitButton>Set</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
