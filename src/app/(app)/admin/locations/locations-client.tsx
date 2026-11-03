"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, Field, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/action-form";
import { Badge, Button, Card } from "@/components/ui";
import { archiveLocationAction, createLocationAction, restoreLocationAction, updateLocationAction } from "../actions";

type Loc = { id: number; name: string; country: string; type: "STORAGE" | "VENUE"; notes: string | null; archived: boolean };

const COUNTRIES = [
  "Austria", "Belgium", "Denmark", "Estonia", "Finland", "France", "Germany", "Iceland", "Ireland", "Italy",
  "Latvia", "Lithuania", "Netherlands", "Norway", "Poland", "Portugal", "Spain", "Sweden", "Switzerland",
  "United Kingdom", "United States",
];

function LocationFields({ loc }: { loc?: Loc }) {
  return (
    <>
      <Field label="Name" name="name">
        <TextInput name="name" defaultValue={loc?.name} placeholder="e.g. Oslo storage unit" />
      </Field>
      <Field label="Country" name="country">
        <TextInput name="country" defaultValue={loc?.country} list="countries" autoComplete="off" />
        <datalist id="countries">
          {COUNTRIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Type" name="type">
        <SelectInput name="type" defaultValue={loc?.type ?? "STORAGE"}>
          <option value="STORAGE">Storage</option>
          <option value="VENUE">Event venue</option>
        </SelectInput>
      </Field>
      <Field label="Address / notes" name="notes" hint="Optional">
        <TextArea name="notes" defaultValue={loc?.notes ?? ""} />
      </Field>
    </>
  );
}

export function AddLocation() {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>+ Add location</Button>;
  return (
    <Card className="max-w-xl p-4">
      <ActionForm action={createLocationAction} onSuccess={() => setOpen(false)}>
        <LocationFields />
        <div className="flex gap-2">
          <SubmitButton>Add location</SubmitButton>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </ActionForm>
    </Card>
  );
}

export function LocationRow({ loc }: { loc: Loc }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="p-4">
        <ActionForm action={updateLocationAction.bind(null, loc.id)} onSuccess={() => setEditing(false)}>
          <LocationFields loc={loc} />
          <div className="flex gap-2">
            <SubmitButton>Save</SubmitButton>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </ActionForm>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {loc.name}
          <Badge tone={loc.type === "STORAGE" ? "brand" : "amber"}>{loc.type === "STORAGE" ? "Storage" : "Event venue"}</Badge>
          {loc.archived && <Badge>Archived</Badge>}
        </p>
        <p className="text-sm text-gray-600">{loc.country}</p>
      </div>
      {loc.archived ? (
        <ActionButton variant="secondary" action={restoreLocationAction.bind(null, loc.id)}>
          Restore
        </ActionButton>
      ) : (
        <>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <ActionButton
            variant="ghost"
            className="text-red-700"
            action={archiveLocationAction.bind(null, loc.id)}
            confirm={`Archive ${loc.name}? It will be hidden from lists and pickers.`}
          >
            Archive
          </ActionButton>
        </>
      )}
    </div>
  );
}
