"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, Field, SubmitButton, TextInput } from "@/components/action-form";
import { BoxIcon, ChevronRightIcon } from "@/components/icons";
import { Card, inputClass, SectionTitle } from "@/components/ui";
import { createBoxAction } from "../actions";

export function NewBoxForm({
  locations,
  emptyBoxes,
  defaultLocationId,
}: {
  locations: { id: number; name: string }[];
  emptyBoxes: { code: string; locationId: number; description: string | null }[];
  defaultLocationId?: number;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(String(defaultLocationId ?? locations[0]?.id ?? ""));
  const reusable = emptyBoxes.filter((b) => String(b.locationId) === locationId);

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-4">
        <ActionForm action={createBoxAction} onSuccess={(r) => r.data && router.push(`/boxes/${r.data.code}/pack`)}>
          <Field label="Location" name="locationId">
            <select id="locationId" name="locationId" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" name="description" hint="Optional, e.g. what's written on the box">
            <TextInput name="description" />
          </Field>
          <SubmitButton className="min-h-14 w-full text-lg" pendingText="Creating…">
            Create box &amp; start packing
          </SubmitButton>
        </ActionForm>
      </Card>

      {reusable.length > 0 && (
        <>
          <SectionTitle>Or use an empty box that&apos;s already here</SectionTitle>
          <Card>
            <ul className="divide-y divide-gray-100">
              {reusable.map((b) => (
                <li key={b.code}>
                  <Link href={`/boxes/${b.code}/pack`} className="flex min-h-14 items-center gap-3 px-4 active:bg-gray-50">
                    <BoxIcon className="text-brand-700" />
                    <span className="flex-1">
                      <span className="block font-semibold">{b.code}</span>
                      {b.description && <span className="text-sm text-gray-600">{b.description}</span>}
                    </span>
                    <ChevronRightIcon className="text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
