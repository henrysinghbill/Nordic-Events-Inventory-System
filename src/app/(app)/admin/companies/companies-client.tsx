"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton, TextInput } from "@/components/action-form";
import { Badge, Button, cx } from "@/components/ui";
import { createCompanyAction, removeCompanyAction, renameCompanyAction, restoreCompanyAction } from "../actions";

/** A one-line form: input and buttons side by side, with any error message on its own line below. */
const ROW = "flex flex-wrap items-start gap-2 space-y-0 [&>[role=alert]]:basis-full";

export function AddCompanyForm() {
  return (
    <ActionForm action={createCompanyAction} resetOnSuccess className={ROW}>
      <div className="min-w-0 flex-1">
        <TextInput name="name" placeholder="New company name" aria-label="New company name" />
      </div>
      <SubmitButton pendingText="Adding…">Add</SubmitButton>
    </ActionForm>
  );
}

export function CompanyRow({
  company,
}: {
  company: { id: number; name: string; archived: boolean; itemCount: number };
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <ActionForm
        action={renameCompanyAction.bind(null, company.id)}
        onSuccess={() => setEditing(false)}
        className={cx(ROW, "px-4 py-3")}
      >
        <div className="min-w-0 flex-1">
          <TextInput name="name" defaultValue={company.name} autoFocus aria-label="Company name" />
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
        <p className="font-medium">
          {company.name} {company.archived && <Badge>Archived</Badge>}
        </p>
        <p className="text-sm text-gray-600">
          {company.itemCount} item{company.itemCount === 1 ? "" : "s"}
        </p>
      </div>
      {company.archived ? (
        <ActionButton variant="secondary" action={restoreCompanyAction.bind(null, company.id)}>
          Restore
        </ActionButton>
      ) : (
        <>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <ActionButton
            variant="ghost"
            className="text-red-700"
            action={removeCompanyAction.bind(null, company.id)}
            confirm={
              company.itemCount > 0
                ? `${company.itemCount} items are tagged with ${company.name}, so it will be archived (hidden from pickers, history kept). Continue?`
                : `Delete ${company.name}?`
            }
          >
            Remove
          </ActionButton>
        </>
      )}
    </div>
  );
}
