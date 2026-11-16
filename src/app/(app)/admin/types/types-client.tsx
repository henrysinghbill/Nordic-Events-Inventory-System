"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton, TextInput } from "@/components/action-form";
import { Button, cx } from "@/components/ui";
import { plural } from "@/lib/format";
import { addTypeAction, deleteTypeAction, renameTypeAction } from "../actions";

/** A one-line form: input and buttons side by side, with any error message on its own line below. */
const ROW = "flex flex-wrap items-start gap-2 space-y-0 [&>[role=alert]]:basis-full";

export function AddTypeForm() {
  return (
    <ActionForm action={addTypeAction} resetOnSuccess className={ROW}>
      <div className="min-w-0 flex-1">
        <TextInput name="name" placeholder="New type, e.g. Banner" aria-label="New type name" maxLength={40} />
      </div>
      <SubmitButton pendingText="Adding…">Add</SubmitButton>
    </ActionForm>
  );
}

export function TypeRow({ type }: { type: { id: number; name: string; itemCount: number } }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <ActionForm
        action={renameTypeAction.bind(null, type.id)}
        onSuccess={() => setEditing(false)}
        className={cx(ROW, "px-4 py-3")}
      >
        <div className="min-w-0 flex-1">
          <TextInput name="name" defaultValue={type.name} autoFocus aria-label="Type name" maxLength={40} />
        </div>
        <SubmitButton>Save</SubmitButton>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </ActionForm>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{type.name}</p>
        <p className="text-sm text-gray-600">
          {type.itemCount > 0 ? (
            <Link href={`/items?type=${type.id}&archived=1`} className="text-brand-700">
              {plural(type.itemCount, "item")}
            </Link>
          ) : (
            "No items"
          )}
        </p>
      </div>
      <Button variant="ghost" onClick={() => setEditing(true)}>
        Rename
      </Button>
      <ActionButton
        variant="ghost"
        className="text-red-700"
        action={deleteTypeAction.bind(null, type.id)}
        confirm={
          type.itemCount > 0
            ? `Delete the type ${type.name}? ${type.itemCount === 1 ? "1 item has" : `${type.itemCount} items have`} it. The items stay, but will have no type.`
            : `Delete the type ${type.name}?`
        }
      >
        Delete
      </ActionButton>
    </div>
  );
}
