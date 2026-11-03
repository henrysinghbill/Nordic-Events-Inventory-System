"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/action-form";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { ScanOrType } from "@/components/scanner";
import { useToast } from "@/components/toast";
import { Button, Card, inputClass } from "@/components/ui";
import { useRequestId, useServerAction } from "@/components/use-server-action";
import { interpretScan, ROUTING_MESSAGE } from "@/lib/barcodes";
import { shipAction } from "../../actions";

type Scanned = { raw: string; label: string; value: string };

export function ShipForm({
  boxId,
  code,
  destinations,
  hasWaybill,
}: {
  boxId: number;
  code: string;
  destinations: { id: number; name: string; country: string }[];
  hasWaybill: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [destinationId, setDestinationId] = useState(String(destinations[0]?.id ?? ""));
  const [scanned, setScanned] = useState<Scanned[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const { run, pending, error } = useServerAction((form: FormData) => shipAction(boxId, form));
  const requestId = useRequestId();

  const havePiece = scanned.some((s) => s.label === "DHL piece ID");
  const haveWaybill = scanned.some((s) => s.label === "DHL waybill");

  function onScan(raw: string) {
    setScanKey((k) => k + 1); // clears the text field
    const m = interpretScan(raw);
    if (m.kind === "dhl_routing") return setScanError(ROUTING_MESSAGE);
    if (m.kind === "box") return setScanError("That's an app box label, not the DHL label.");
    if (m.kind === "empty") return;
    if (scanned.some((s) => s.value === m.value)) return setScanError("Already scanned.");
    setScanError(null);
    const label = m.kind === "dhl_piece" ? "DHL piece ID" : m.kind === "dhl_waybill" ? "DHL waybill" : "Other barcode";
    setScanned((s) => [...s, { raw, label, value: m.value }]);
  }

  async function ship() {
    const form = new FormData();
    form.set("requestId", requestId.current());
    form.set("destinationId", destinationId);
    scanned.forEach((s) => form.append("barcode", s.raw));
    const r = await run(form);
    if (r?.ok) {
      requestId.renew();
      toast("success", r.message ?? "Shipped.");
      router.push(`/boxes/${code}`);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <label className="block">
        <span className="mb-1 block font-medium">Destination</span>
        <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className={inputClass}>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.country})
            </option>
          ))}
        </select>
      </label>

      <Card className="space-y-3 p-4">
        <div>
          <p className="font-medium">DHL label (optional, can be done later)</p>
          <p className="text-sm text-gray-600">Scan the bottom barcode starting JD, then the waybill barcode.</p>
        </div>
        {scanned.length > 0 && (
          <ul className="space-y-1">
            {scanned.map((s) => (
              <li key={s.value} className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
                <CheckIcon className="shrink-0 text-green-700" size={20} />
                <span className="flex-1">
                  <span className="block text-sm text-gray-600">{s.label}</span>
                  <span className="font-mono break-all">{s.value}</span>
                </span>
                <button
                  type="button"
                  aria-label="Remove"
                  className="p-2 text-gray-500"
                  onClick={() => setScanned((list) => list.filter((x) => x.value !== s.value))}
                >
                  <CloseIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ScanOrType
          key={scanKey}
          onValue={onScan}
          scanLabel={havePiece ? (haveWaybill || hasWaybill ? "Scan another barcode" : "Scan the waybill") : "Scan DHL label"}
          placeholder="JD… or waybill number"
          hint={havePiece ? "Now scan the waybill barcode" : "Scan the bottom DHL barcode (starting JD)"}
        />
        {scanError && <FormError message={scanError} />}
      </Card>

      {error && <FormError message={error} />}
      <Button className="min-h-14 w-full text-lg" disabled={pending || !destinationId} onClick={ship}>
        {pending ? "Shipping…" : scanned.length ? `Ship ${code}` : `Ship ${code} without scanning`}
      </Button>
    </div>
  );
}
