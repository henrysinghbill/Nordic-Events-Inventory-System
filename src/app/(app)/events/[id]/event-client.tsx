"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { FormError } from "@/components/action-form";
import { CloseIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, cx, inputClass } from "@/components/ui";
import { useRequestId, useServerAction } from "@/components/use-server-action";
import type { ActionResult } from "@/lib/action-result";
import { addBoxToEventAction, arriveEventAction, removeBoxFromEventAction, shipEventAction } from "../actions";

/**
 * "Ship all" / "Mark all arrived": one tap moves every box, after a
 * confirmation listing them. Retries after a lost connection are safe.
 */
export function BulkMoveButton({
  eventId,
  kind,
  label,
  question,
  className,
}: {
  eventId: number;
  kind: "ship" | "arrive";
  label: string;
  question: string;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const requestId = useRequestId();
  const action = kind === "ship" ? shipEventAction : arriveEventAction;
  const { run, pending, error } = useServerAction((form: FormData) => action(eventId, form));
  const [confirming, setConfirming] = useState(false);

  async function go() {
    const form = new FormData();
    form.set("requestId", requestId.current());
    const r = await run(form);
    if (r?.ok) {
      requestId.renew();
      setConfirming(false);
      toast("success", r.message ?? "Done.");
      router.refresh();
    }
  }

  return (
    <>
      <Button className={cx("min-h-14 w-full text-lg", className)} onClick={() => setConfirming(true)}>
        {label}
      </Button>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <Card className="w-full max-w-sm space-y-4 p-5">
            <p className="text-lg font-bold whitespace-pre-line">{question}</p>
            {error && <FormError message={error} />}
            <div className="grid gap-2">
              <Button autoFocus className="min-h-14 text-lg" disabled={pending} onClick={go}>
                {pending ? "Saving…" : error ? "Try again" : "Yes"}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export function RemoveBoxButton({ eventId, boxId, code }: { eventId: number; boxId: number; code: string }) {
  return (
    <ActionButton
      variant="ghost"
      className="min-h-10 px-2 text-gray-500"
      aria-label={`Remove ${code} from this event`}
      title="Remove from this event"
      confirm={`Remove ${code} from this event? The box and its contents are not changed.`}
      pendingText="…"
      action={() => removeBoxFromEventAction(eventId, boxId)}
    >
      <CloseIcon size={20} />
    </ActionButton>
  );
}

type BoxOption = { id: number; label: string; group: string };

export function AddBoxForm({ eventId, boxes }: { eventId: number; boxes: BoxOption[] }) {
  const toast = useToast();
  const [boxId, setBoxId] = useState("");
  const { run, pending, error } = useServerAction((form: FormData) => addBoxToEventAction(eventId, form));
  const groups = [...new Set(boxes.map((b) => b.group))];
  if (boxes.length === 0) return null;

  async function add() {
    const form = new FormData();
    form.set("boxId", boxId);
    const r: ActionResult | null = await run(form);
    if (r?.ok) {
      toast("success", r.message ?? "Added.");
      setBoxId("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={boxId} onChange={(e) => setBoxId(e.target.value)} className={inputClass} aria-label="Add an existing box">
          <option value="">Add an existing box…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {boxes
                .filter((b) => b.group === g)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <Button variant="secondary" disabled={!boxId || pending} onClick={add}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <FormError message={error} />}
    </div>
  );
}
