"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormError } from "@/components/action-form";
import { AlertIcon, BoxIcon, ChevronRightIcon } from "@/components/icons";
import { ScanOrType } from "@/components/scanner";
import { useToast } from "@/components/toast";
import { Button, Card, inputClass } from "@/components/ui";
import { newRequestId, useServerAction } from "@/components/use-server-action";
import type { Resolved } from "@/server/stock/boxes";
import { createBoxWithBarcodeAction, linkBarcodeAction, resolveScanAction } from "../boxes/actions";

type BoxOption = { id: number; code: string; where: string };
type LocationOption = { id: number; name: string };

const KIND_LABEL = { dhl_piece: "DHL piece ID", dhl_waybill: "DHL waybill", other: "barcode" } as const;

export function ScanFlow({ boxes, locations }: { boxes: BoxOption[]; locations: LocationOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const resolve = useServerAction(resolveScanAction);
  const [outcome, setOutcome] = useState<Resolved | null>(null);
  const [scanKey, setScanKey] = useState(0);

  async function onValue(value: string) {
    setOutcome(null);
    const r = await resolve.run(value);
    if (!r?.ok || !r.data) return;
    if (r.data.result === "box") {
      toast("success", `Opening ${r.data.code}`);
      router.push(`/boxes/${r.data.code}`);
    } else {
      setOutcome(r.data);
    }
  }

  function scanAgain() {
    setOutcome(null);
    setScanKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {!outcome && (
        <ScanOrType key={scanKey} onValue={onValue} pending={resolve.pending} autoOpen scanLabel="Open camera" />
      )}
      {resolve.pending && <p className="text-center text-gray-600">Looking it up…</p>}
      {resolve.error && <FormError message={resolve.error} />}

      {outcome?.result === "message" && (
        <Card className="p-4">
          <div className="flex gap-3">
            <AlertIcon className="shrink-0 text-amber-600" />
            <p className="font-medium">{outcome.message}</p>
          </div>
          <Button className="mt-4 w-full" onClick={scanAgain}>
            Scan again
          </Button>
        </Card>
      )}

      {outcome?.result === "choose" && (
        <Card className="p-4">
          <p className="mb-3 font-medium">This waybill is on {outcome.boxes.length} boxes. Which one?</p>
          <ul className="space-y-2">
            {outcome.boxes.map((b) => (
              <li key={b.code}>
                <Link
                  href={`/boxes/${b.code}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 px-4 active:bg-gray-50"
                >
                  <BoxIcon className="text-brand-700" />
                  <span className="flex-1">
                    <span className="block font-semibold">{b.code}</span>
                    <span className="text-sm text-gray-600">{b.where}</span>
                  </span>
                  <ChevronRightIcon className="text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-3 w-full" onClick={scanAgain}>
            Scan something else
          </Button>
        </Card>
      )}

      {outcome?.result === "unknown" && (
        <UnknownBarcode
          value={outcome.value}
          kindLabel={KIND_LABEL[outcome.kind]}
          boxes={boxes}
          locations={locations}
          onCancel={scanAgain}
          onDone={(code) => router.push(`/boxes/${code}`)}
        />
      )}
    </div>
  );
}

function UnknownBarcode({
  value,
  kindLabel,
  boxes,
  locations,
  onCancel,
  onDone,
}: {
  value: string;
  kindLabel: string;
  boxes: BoxOption[];
  locations: LocationOption[];
  onCancel: () => void;
  onDone: (code: string) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"choose" | "link" | "create">("choose");
  const [boxId, setBoxId] = useState(String(boxes[0]?.id ?? ""));
  const [locationId, setLocationId] = useState(String(locations[0]?.id ?? ""));
  const requestId = useRef(newRequestId());
  const link = useServerAction(linkBarcodeAction);
  const create = useServerAction(createBoxWithBarcodeAction);

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="font-medium">This {kindLabel} isn&apos;t linked to any box yet:</p>
        <p className="mt-1 font-mono text-lg break-all">{value}</p>
      </div>

      {mode === "choose" && (
        <div className="grid gap-2">
          <Button onClick={() => setMode("link")} disabled={boxes.length === 0}>
            Link to an existing box
          </Button>
          <Button variant="secondary" onClick={() => setMode("create")}>
            Create a new box with this barcode
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block font-medium">Box</span>
            <select value={boxId} onChange={(e) => setBoxId(e.target.value)} className={inputClass}>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.where}
                </option>
              ))}
            </select>
          </label>
          {link.error && <FormError message={link.error} />}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={link.pending}
              onClick={async () => {
                const box = boxes.find((b) => String(b.id) === boxId);
                if (!box) return;
                const r = await link.run(box.id, value);
                if (r?.ok) {
                  toast("success", r.message ?? "Linked.");
                  onDone(box.code);
                }
              }}
            >
              {link.pending ? "Linking…" : "Link barcode"}
            </Button>
            <Button variant="secondary" onClick={() => setMode("choose")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {mode === "create" && (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block font-medium">Where is the box now?</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {create.error && <FormError message={create.error} />}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={create.pending}
              onClick={async () => {
                const form = new FormData();
                form.set("requestId", requestId.current);
                form.set("locationId", locationId);
                form.set("barcode", value);
                const r = await create.run(form);
                if (r?.ok && r.data) {
                  toast("success", r.message ?? "Box created.");
                  onDone(r.data.code);
                }
              }}
            >
              {create.pending ? "Creating…" : "Create box"}
            </Button>
            <Button variant="secondary" onClick={() => setMode("choose")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
