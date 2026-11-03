"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ActionForm, Field, FormError, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/action-form";
import { CompanyChips, QuantityInput } from "@/components/form-controls";
import { CameraIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { useToast } from "@/components/toast";
import { Button, Card, cx } from "@/components/ui";
import { newRequestId, useServerAction } from "@/components/use-server-action";
import { resizeImage } from "@/lib/resize-image";
import {
  addItemPhotoAction,
  addStockAction,
  removeItemPhotoAction,
  setItemArchivedAction,
  setMainPhotoAction,
  updateItemAction,
} from "../actions";

type PhotoInfo = { id: number; key: string };

/** Photo gallery with add / make main / remove. */
export function ItemPhotos({ itemId, name, photos }: { itemId: number; name: string; photos: PhotoInfo[] }) {
  const toast = useToast();
  const [selected, setSelected] = useState(0);
  const upload = useServerAction((form: FormData) => addItemPhotoAction(itemId, form));
  const remove = useServerAction((photoId: number) => removeItemPhotoAction(itemId, photoId));
  const makeMain = useServerAction((photoId: number) => setMainPhotoAction(itemId, photoId));
  const requestId = useRef(newRequestId());
  const current = photos[Math.min(selected, photos.length - 1)];
  const busy = upload.pending || remove.pending || makeMain.pending;
  const error = upload.error ?? remove.error ?? makeMain.error;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("requestId", requestId.current);
    form.set("photo", await resizeImage(file), "photo.jpg");
    const res = await upload.run(form);
    if (res?.ok) {
      requestId.current = newRequestId();
      toast("success", res.message ?? "Photo added.");
      setSelected(photos.length); // the new one
    }
  }

  return (
    <div>
      <Photo photoKey={current?.key} alt={name} size="full" className="aspect-square w-full rounded-2xl md:aspect-[4/3]" />
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(i)}
            className={cx("shrink-0 overflow-hidden rounded-lg", i === selected && "ring-2 ring-brand-600")}
            aria-label={`Photo ${i + 1}${i === 0 ? " (main)" : ""}`}
          >
            <Photo photoKey={p.key} alt="" className="h-16 w-16" />
          </button>
        ))}
        <label
          className={cx(
            "flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-600",
            busy && "pointer-events-none opacity-50",
          )}
        >
          <CameraIcon size={20} />
          {upload.pending ? "…" : "Add"}
          <input type="file" accept="image/*" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
      </div>
      {current && photos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {photos[0]?.id !== current.id && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const r = await makeMain.run(current.id);
                if (r?.ok) {
                  setSelected(0);
                  toast("success", r.message ?? "Done.");
                }
              }}
            >
              Make main photo
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            className="text-red-700"
            onClick={async () => {
              if (!confirm("Remove this photo?")) return;
              const r = await remove.run(current.id);
              if (r?.ok) {
                setSelected(0);
                toast("success", r.message ?? "Removed.");
              }
            }}
          >
            Remove photo
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <FormError message={error} />
        </div>
      )}
    </div>
  );
}

export function AddStockForm({
  itemId,
  locations,
}: {
  itemId: number;
  locations: { id: number; name: string; country: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  if (!open) {
    return (
      <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        + Add stock
      </Button>
    );
  }
  return (
    <Card className="p-4">
      <ActionForm
        action={addStockAction.bind(null, itemId)}
        onSuccess={() => {
          setOpen(false);
          setQuantity("1");
        }}
      >
        <Field label="Quantity to add" name="quantity">
          <QuantityInput value={quantity} onChange={setQuantity} name="quantity" />
        </Field>
        <Field label="Location" name="locationId">
          <SelectInput name="locationId">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.country})
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex gap-2">
          <SubmitButton className="flex-1">Add stock</SubmitButton>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </ActionForm>
    </Card>
  );
}

export function ArchiveButton({ itemId, archived, quantity }: { itemId: number; archived: boolean; quantity: number }) {
  const toast = useToast();
  const { run, pending, error } = useServerAction((value: boolean) => setItemArchivedAction(itemId, value));
  return (
    <div>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          if (!archived) {
            const warning =
              quantity > 0
                ? `This item still has ${quantity} in stock. Archiving hides it from lists and pickers, but the stock stays recorded. Archive anyway?`
                : "Archive this item? It will be hidden from lists and pickers.";
            if (!confirm(warning)) return;
          }
          const r = await run(!archived);
          if (r?.ok) toast("success", r.message ?? "Done.");
        }}
      >
        {pending ? "Saving…" : archived ? "Restore item" : "Archive item"}
      </Button>
      {error && (
        <div className="mt-2">
          <FormError message={error} />
        </div>
      )}
    </div>
  );
}

export function EditItemForm({
  item,
  companies,
}: {
  item: { id: number; name: string; description: string | null; lowStockThreshold: number | null; companyIds: number[] };
  companies: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [companyIds, setCompanyIds] = useState(item.companyIds);
  return (
    <ActionForm
      action={updateItemAction.bind(null, item.id)}
      successMessage="Item saved."
      onSuccess={() => router.push(`/items/${item.id}`)}
    >
      <Field label="Name" name="name">
        <TextInput name="name" defaultValue={item.name} />
      </Field>
      <Field label="Companies" name="companyIds">
        <CompanyChips companies={companies} selected={companyIds} onChange={setCompanyIds} name="companyIds" />
      </Field>
      <Field label="Description / notes" name="description">
        <TextArea name="description" defaultValue={item.description ?? ""} />
      </Field>
      <Field label="Low-stock warning below" name="lowStockThreshold" hint="Optional. Leave empty for no warning.">
        <TextInput name="lowStockThreshold" inputMode="numeric" defaultValue={item.lowStockThreshold ?? ""} />
      </Field>
      <SubmitButton className="w-full sm:w-auto">Save changes</SubmitButton>
    </ActionForm>
  );
}
