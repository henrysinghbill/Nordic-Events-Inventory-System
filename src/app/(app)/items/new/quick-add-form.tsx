"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormError } from "@/components/action-form";
import { CompanyChips, QuantityInput } from "@/components/form-controls";
import { CameraIcon, ImageIcon } from "@/components/icons";
import { Photo } from "@/components/photo";
import { useToast } from "@/components/toast";
import { Button, Card, cx, inputClass } from "@/components/ui";
import { newRequestId, useServerAction } from "@/components/use-server-action";
import { resizeImage } from "@/lib/resize-image";
import { quickAddAction } from "../actions";

type Suggestion = { id: number; name: string; photoKey: string | null; companyIds: number[] };

/**
 * Quick-add on a phone: photo first, then the details.
 * "Save & add another" keeps the location, box and companies for the next item.
 */
export function QuickAddForm({
  companies,
  locations,
  boxes,
  defaultLocationId,
  duplicateOf,
}: {
  companies: { id: number; name: string }[];
  locations: { id: number; name: string; country: string }[];
  boxes: { id: number; code: string; locationId: number; description: string | null }[];
  defaultLocationId?: number;
  /** "Duplicate" on an item page: start from that item's name and companies. */
  duplicateOf?: { id: number; name: string; companyIds: number[] };
}) {
  const router = useRouter();
  const toast = useToast();
  const { run, pending, error, fieldErrors } = useServerAction(quickAddAction);
  const requestId = useRef(newRequestId());
  const nameRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"photo" | "details">("photo");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [duplicate, setDuplicate] = useState(duplicateOf ?? null);
  const [name, setName] = useState(duplicateOf?.name ?? "");
  const [existing, setExisting] = useState<Suggestion | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [companyIds, setCompanyIds] = useState<number[]>(duplicateOf?.companyIds ?? []);
  const [quantity, setQuantity] = useState("1");
  const [locationId, setLocationId] = useState(String(defaultLocationId ?? locations[0]?.id ?? ""));
  const [boxId, setBoxId] = useState("");
  const boxesHere = boxes.filter((b) => String(b.locationId) === locationId);
  const [addPhotoToExisting, setAddPhotoToExisting] = useState(false);

  // Free the preview image memory when it changes.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  // Search-as-you-type: suggest existing items so stock is added to them instead of creating duplicates.
  useEffect(() => {
    if (existing || duplicate || name.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items/suggest?q=${encodeURIComponent(name.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) setSuggestions((await res.json()).items);
      } catch {
        /* suggestions are a convenience; ignore network hiccups */
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, existing, duplicate]);
  // While duplicating, the original's own name would always match, so suggestions are off.
  const visibleSuggestions = existing || duplicate || name.trim().length < 2 ? [] : suggestions;
  const sameNameAsOriginal = duplicate && name.trim().toLowerCase() === duplicate.name.trim().toLowerCase();

  async function onPhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setProcessing(true);
    const blob = await resizeImage(file);
    setProcessing(false);
    setPhoto(blob);
    setPreview(URL.createObjectURL(blob));
    setStep("details");
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function chooseExisting(s: Suggestion) {
    setExisting(s);
    setName(s.name);
    setSuggestions([]);
    setAddPhotoToExisting(!s.photoKey && Boolean(photo));
  }

  async function save(addAnother: boolean) {
    const form = new FormData();
    form.set("requestId", requestId.current);
    form.set("quantity", quantity);
    form.set("locationId", locationId);
    if (boxId) form.set("boxId", boxId);
    if (existing) {
      form.set("existingItemId", String(existing.id));
      if (addPhotoToExisting) form.set("addPhoto", "1");
    } else {
      form.set("name", name);
      companyIds.forEach((id) => form.append("companyIds", String(id)));
      if (duplicate) form.set("duplicateOf", String(duplicate.id));
    }
    if (photo) form.set("photo", photo, "photo.jpg");

    const result = await run(form);
    if (!result?.ok) return;
    requestId.current = newRequestId();
    toast("success", result.message ?? "Saved.");
    if (addAnother) {
      // Keep location and companies; clear what differs per item.
      setPhoto(null);
      setPreview(null);
      setName("");
      setExisting(null);
      setDuplicate(null);
      setQuantity("1");
      setStep("photo");
      window.scrollTo({ top: 0 });
    } else if (result.data) {
      router.push(`/items/${result.data.itemId}`);
    }
  }

  const photoInputs = (
    <>
      <input id="photo-camera" type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhotoChosen} />
      <input id="photo-library" type="file" accept="image/*" className="sr-only" onChange={onPhotoChosen} />
    </>
  );

  const duplicateBanner = duplicate && (
    <p className="rounded-xl bg-brand-50 p-3 text-brand-800 ring-1 ring-brand-200">
      Duplicating <strong>{duplicate.name}</strong>: companies, description and low-stock level are copied. Take a photo and
      change the name.
    </p>
  );

  if (step === "photo") {
    return (
      <div className="mx-auto max-w-md space-y-3">
        {duplicateBanner}
        {photoInputs}
        <label
          htmlFor="photo-camera"
          className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl bg-brand-600 text-white shadow active:bg-brand-800"
        >
          <CameraIcon size={56} />
          <span className="text-xl font-bold">{processing ? "Preparing photo…" : "Take photo"}</span>
        </label>
        <label
          htmlFor="photo-library"
          className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white font-semibold active:bg-gray-100"
        >
          <ImageIcon size={20} /> Choose from library
        </label>
        <Button variant="ghost" className="w-full" onClick={() => setStep("details")}>
          Skip photo for now
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      {duplicateBanner}
      {photoInputs}
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="New photo" className="h-24 w-24 rounded-xl object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-gray-200 text-gray-500">
            <ImageIcon />
          </div>
        )}
        <label htmlFor="photo-camera" className="cursor-pointer font-semibold text-brand-700">
          {preview ? "Retake photo" : "Take photo"}
        </label>
      </div>

      <div>
        <label htmlFor="name" className="mb-1 block font-medium">
          Name
        </label>
        {existing ? (
          <Card className="flex items-center gap-3 p-3 ring-2 ring-brand-500">
            <Photo photoKey={existing.photoKey} alt={existing.name} className="h-12 w-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{existing.name}</p>
              <p className="text-sm text-gray-600">Adding stock to this existing item</p>
            </div>
            <Button variant="ghost" className="shrink-0" onClick={() => setExisting(null)}>
              Change
            </Button>
          </Card>
        ) : (
          <input
            ref={nameRef}
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="e.g. Functional Future roll-up banner"
            className={cx(inputClass, fieldErrors.name && "border-red-500")}
          />
        )}
        {fieldErrors.name && <p className="mt-1 text-sm font-medium text-red-700">{fieldErrors.name}</p>}
        {sameNameAsOriginal && !fieldErrors.name && (
          <p className="mt-1 text-sm font-medium text-amber-800">Same name as the original — change it so you can tell them apart.</p>
        )}
        {visibleSuggestions.length > 0 && (
          <div className="mt-2 rounded-xl bg-amber-50 p-2 ring-1 ring-amber-200">
            <p className="px-1 pb-1 text-sm font-medium text-amber-900">Already exists? Tap to add stock to it instead:</p>
            <ul className="space-y-1">
              {visibleSuggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => chooseExisting(s)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg bg-white p-2 text-left active:bg-gray-100"
                  >
                    <Photo photoKey={s.photoKey} alt="" className="h-10 w-10 shrink-0 rounded-md" />
                    <span className="font-medium">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {existing ? (
        photo && (
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              checked={addPhotoToExisting}
              onChange={(e) => setAddPhotoToExisting(e.target.checked)}
              className="h-6 w-6 accent-brand-600"
            />
            Also add this photo to the item
          </label>
        )
      ) : (
        <div>
          <p className="mb-1 font-medium">Companies</p>
          <CompanyChips companies={companies} selected={companyIds} onChange={setCompanyIds} error={fieldErrors.companyIds} />
        </div>
      )}

      <div>
        <label htmlFor="quantity" className="mb-1 block font-medium">
          Quantity
        </label>
        <QuantityInput value={quantity} onChange={setQuantity} />
        {fieldErrors.quantity && <p className="mt-1 text-sm font-medium text-red-700">{fieldErrors.quantity}</p>}
      </div>

      <div>
        <label htmlFor="locationId" className="mb-1 block font-medium">
          Location
        </label>
        <select
          id="locationId"
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setBoxId("");
          }}
          className={inputClass}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.country})
            </option>
          ))}
        </select>
        {fieldErrors.locationId && <p className="mt-1 text-sm font-medium text-red-700">{fieldErrors.locationId}</p>}
      </div>

      {boxesHere.length > 0 && (
        <div>
          <label htmlFor="boxId" className="mb-1 block font-medium">
            Box <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <select id="boxId" value={boxId} onChange={(e) => setBoxId(e.target.value)} className={inputClass}>
            <option value="">Not in a box (loose)</option>
            {boxesHere.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
                {b.description ? ` — ${b.description}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <FormError message={error} />}

      <div className="grid gap-2">
        <Button onClick={() => save(true)} disabled={pending} className="min-h-14 text-lg">
          {pending ? "Saving…" : "Save & add another"}
        </Button>
        <Button variant="secondary" onClick={() => save(false)} disabled={pending}>
          Save
        </Button>
      </div>
    </div>
  );
}
