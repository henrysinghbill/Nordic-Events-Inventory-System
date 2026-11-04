"use client";

import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { ActionForm, Field, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/action-form";
import { Card } from "@/components/ui";
import { createEventAction, deleteEventAction, updateEventAction } from "./actions";

type Venue = { id: number; name: string; type: "STORAGE" | "VENUE" };
type EventValues = { id: number; name: string; venueId: number; startDate: string; endDate: string; notes: string | null };

function Fields({ venues, event }: { venues: Venue[]; event?: EventValues }) {
  const group = (type: Venue["type"]) =>
    venues
      .filter((v) => v.type === type)
      .map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ));
  return (
    <>
      <Field label="Name" name="name">
        <TextInput name="name" defaultValue={event?.name} placeholder="e.g. Vitafoods Europe 2026" autoComplete="off" />
      </Field>
      <Field label="Venue" name="venueId" hint="New venues are added by an administrator under More → Locations.">
        <SelectInput name="venueId" defaultValue={event?.venueId ?? ""}>
          <option value="">Choose…</option>
          <optgroup label="Event venues">{group("VENUE")}</optgroup>
          <optgroup label="Storage locations">{group("STORAGE")}</optgroup>
        </SelectInput>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" name="startDate">
          <TextInput name="startDate" type="date" defaultValue={event?.startDate} />
        </Field>
        <Field label="End date" name="endDate">
          <TextInput name="endDate" type="date" defaultValue={event?.endDate} />
        </Field>
      </div>
      <Field label="Notes" name="notes" hint="Optional: stand number, contact on site, delivery instructions…">
        <TextArea name="notes" defaultValue={event?.notes ?? ""} />
      </Field>
    </>
  );
}

export function NewEventForm({ venues }: { venues: Venue[] }) {
  const router = useRouter();
  return (
    <Card className="mx-auto max-w-xl p-4">
      <ActionForm action={createEventAction} onSuccess={(r) => r.data && router.push(`/events/${r.data.id}`)}>
        <Fields venues={venues} />
        <SubmitButton className="w-full" pendingText="Creating…">
          Create event
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}

export function EditEventForm({ venues, event }: { venues: Venue[]; event: EventValues }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card className="p-4">
        <ActionForm action={updateEventAction.bind(null, event.id)} onSuccess={() => router.push(`/events/${event.id}`)}>
          <Fields venues={venues} event={event} />
          <SubmitButton className="w-full">Save changes</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="space-y-2 p-4">
        <h2 className="font-semibold">Delete this event</h2>
        <p className="text-sm text-gray-600">
          The packing list is deleted. Boxes and stock are not touched (boxes just stop being linked to the event), and the
          history is kept.
        </p>
        <ActionButton
          variant="danger"
          confirm={`Delete "${event.name}"? This can't be undone.`}
          pendingText="Deleting…"
          action={async () => {
            const r = await deleteEventAction(event.id);
            if (r.ok) router.push("/events");
            return r;
          }}
        >
          Delete event
        </ActionButton>
      </Card>
    </div>
  );
}
