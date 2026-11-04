"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, Field, FormError, SelectInput, SubmitButton, TextInput } from "@/components/action-form";
import { CameraIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { ScanOrType } from "@/components/scanner";
import { useToast } from "@/components/toast";
import { Button, Card } from "@/components/ui";
import { useServerAction } from "@/components/use-server-action";
import { resizeImage } from "@/lib/resize-image";
import { arriveAction, boxPhotoAction, deleteBoxAction, linkBarcodeAction, updateBoxAction } from "../actions";

type Loc = { id: number; name: string };

export function ArriveForm({ boxId, locations, defaultLocationId }: { boxId: number; locations: Loc[]; defaultLocationId?: number }) {
  return (
    <ActionForm action={arriveAction.bind(null, boxId)}>
      <Field label="Arrived at" name="locationId">
        <SelectInput name="locationId" defaultValue={defaultLocationId}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <SubmitButton className="min-h-14 w-full text-lg" pendingText="Saving…">
        Mark as arrived
      </SubmitButton>
    </ActionForm>
  );
}

export function BoxPhoto({ boxId, photoKey, code }: { boxId: number; photoKey: string | null; code: string }) {
  const toast = useToast();
  const upload = useServerAction((form: FormData) => boxPhotoAction(boxId, form));
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("photo", await resizeImage(file), "photo.jpg");
    const r = await upload.run(form);
    if (r?.ok) toast("success", r.message ?? "Saved.");
  }
  return (
    <div>
      {photoKey ? (
        <Photo photoKey={photoKey} alt={`Photo of ${code}`} size="full" className="aspect-[4/3] w-full rounded-2xl" />
      ) : null}
      <label className="mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white font-semibold active:bg-gray-100">
        <CameraIcon size={20} />
        {upload.pending ? "Uploading…" : photoKey ? "Replace box photo" : "Take photo of the box"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} disabled={upload.pending} />
      </label>
      {upload.error && (
        <div className="mt-2">
          <FormError message={upload.error} />
        </div>
      )}
    </div>
  );
}

export function DescriptionEditor({ boxId, description }: { boxId: number; description: string | null }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <p className={description ? "flex-1 whitespace-pre-line" : "flex-1 text-gray-500"}>{description ?? "No description."}</p>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
    );
  }
  return (
    <ActionForm action={updateBoxAction.bind(null, boxId)} onSuccess={() => setEditing(false)}>
      <Field label="Description" name="description" hint="e.g. Vitafoods stand parts, or what's written on the box">
        <TextInput name="description" defaultValue={description ?? ""} autoFocus />
      </Field>
      <div className="flex gap-2">
        <SubmitButton>Save</SubmitButton>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}

export function LinkBarcode({ boxId }: { boxId: number }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const link = useServerAction((raws: string[]) => linkBarcodeAction(boxId, raws));
  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        Link a DHL barcode
      </Button>
    );
  }
  return (
    <Card className="space-y-3 p-4">
      <p className="font-medium">Scan the DHL label: the piece ID (starting JD) and/or the waybill.</p>
      <ScanOrType
        autoOpen
        scanLabel="Scan DHL label"
        placeholder="JD… or waybill number"
        hint="Fit the whole DHL label in view, or aim at the barcode starting JD"
        pending={link.pending}
        onValue={async (_best, all) => {
          const r = await link.run(all);
          if (r?.ok) {
            toast("success", r.message ?? "Linked.");
            setOpen(false);
          }
        }}
      />
      {link.error && <FormError message={link.error} />}
      <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
        Done
      </Button>
    </Card>
  );
}

export function DeleteBoxButton({ boxId, code, afterHref }: { boxId: number; code: string; afterHref: string }) {
  const router = useRouter();
  const toast = useToast();
  const del = useServerAction(() => deleteBoxAction(boxId));
  return (
    <div>
      <Button
        variant="secondary"
        className="w-full text-red-700"
        disabled={del.pending}
        onClick={async () => {
          if (!confirm(`Discard ${code}? It will disappear from lists, but its history is kept.`)) return;
          const r = await del.run();
          if (r?.ok) {
            toast("success", r.message ?? "Discarded.");
            router.push(afterHref);
          }
        }}
      >
        {del.pending ? "Discarding…" : "Discard empty box"}
      </Button>
      {del.error && (
        <div className="mt-2">
          <FormError message={del.error} />
        </div>
      )}
    </div>
  );
}
