"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormError } from "@/components/action-form";
import { useToast } from "@/components/toast";
import { Button, Card, cx } from "@/components/ui";
import { useRequestId, useServerAction } from "@/components/use-server-action";
import { parseBoxCode } from "@/lib/barcodes";
import { matchCompanies, type CompanyOption } from "@/lib/company-match";
import { suggestType } from "@/lib/type-suggest";
import { bulkAddAction } from "../../stock-actions";

type Option = { id: number; name: string };
type BoxOption = { id: number; code: string; locationId: number };
type Row = {
  key: number;
  name: string;
  /** The type as typed. Until it is touched, the type suggested from the name is used (see typeOf). */
  type: string;
  typeTouched: boolean;
  companies: string;
  quantity: string;
  locationId: string;
  boxId: string;
  forceNew: boolean;
};

const COLS = ["name", "type", "companies", "quantity", "locationId", "boxId"] as const;
let nextKey = 1;

function emptyRow(locationId: string): Row {
  return { key: nextKey++, name: "", type: "", typeTouched: false, companies: "", quantity: "", locationId, boxId: "", forceNew: false };
}
const isFilled = (r: Row) =>
  Boolean(r.name.trim() || r.companies.trim() || r.quantity.trim() || (r.typeTouched && r.type.trim()));
const isNumber = (s: string | undefined) => /^\d+$/.test(s ?? "");

const cell =
  "block w-full min-h-10 rounded-md border border-gray-300 bg-white px-2 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none";

export function BulkGrid({
  companies,
  types,
  locations,
  boxes,
  items,
}: {
  companies: CompanyOption[];
  types: Option[];
  locations: Option[];
  boxes: BoxOption[];
  items: Option[];
}) {
  const toast = useToast();
  const router = useRouter();
  const firstLocation = String(locations[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, () => emptyRow(firstLocation)));
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const { run, pending, error } = useServerAction(bulkAddAction);
  const requestId = useRequestId();
  const tableRef = useRef<HTMLTableElement>(null);

  const itemsByName = useMemo(() => {
    const map = new Map<string, Option[]>();
    for (const i of items) {
      const key = i.name.trim().toLowerCase();
      map.set(key, [...(map.get(key) ?? []), i]);
    }
    return map;
  }, [items]);

  const filledCount = rows.filter(isFilled).length;

  /** A row's type: what was typed there, or else the type its name suggests ("…roll-up banner" → Banner). */
  const typeOf = (r: Row) => (r.typeTouched ? r.type.trim() : (suggestType(r.name, types)?.name ?? ""));
  const knownType = (name: string) => types.find((t) => t.name.toLowerCase() === name.toLowerCase());

  /** For rows that repeat a new name used earlier in the grid: the earlier row's number. */
  const sameAsRow = useMemo(() => {
    const first = new Map<string, number>();
    const out = new Map<number, number>();
    rows.forEach((r, i) => {
      const key = r.name.trim().toLowerCase();
      if (!key || !isFilled(r)) return;
      const matches = itemsByName.get(key) ?? [];
      if (!r.forceNew && matches.length === 1) return; // existing item
      if (first.has(key)) out.set(i, first.get(key)! + 1);
      else first.set(key, i);
    });
    return out;
  }, [rows, itemsByName]);

  // Warn before leaving the page with unsaved rows.
  useEffect(() => {
    if (filledCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [filledCount]);

  function update(index: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setRowErrors((e) => {
      const { [`row-${index + 1}`]: _gone, ...rest } = e;
      return rest;
    });
  }

  function focusCell(row: number, col: number) {
    if (row >= rows.length) setRows((rs) => [...rs, ...Array.from({ length: row - rs.length + 5 }, () => emptyRow(rs.at(-1)?.locationId ?? firstLocation))]);
    setTimeout(() => tableRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent, row: number, col: number) {
    const isSelect = e.currentTarget.tagName === "SELECT";
    if (e.key === "Enter") {
      e.preventDefault();
      focusCell(row + (e.shiftKey ? -1 : 1), col);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && row > 0) {
      e.preventDefault(); // fill down, like a spreadsheet
      const field = COLS[col];
      const above = rows[row - 1];
      update(
        row,
        field === "locationId"
          ? { locationId: above.locationId, boxId: "" }
          : field === "type"
            ? { type: typeOf(above), typeTouched: true }
            : { [field]: above[field] },
      );
    } else if (!isSelect && e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(row + 1, col);
    } else if (!isSelect && e.key === "ArrowUp" && row > 0) {
      e.preventDefault();
      focusCell(row - 1, col);
    }
  }

  /**
   * Paste several rows from a spreadsheet: name, type, companies, quantity, location, box.
   * Sheets without a type column (name, companies, quantity, …) are recognised by
   * where the quantity is, so they still paste correctly.
   */
  function onPaste(e: React.ClipboardEvent, start: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.trim())) return; // a single value: normal paste
    e.preventDefault();
    const lines = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.split("\t").map((s) => s.trim()));
    const withoutType = lines.filter((c) => isNumber(c[2])).length > lines.filter((c) => isNumber(c[3])).length;
    setRows((rs) => {
      const next = [...rs];
      while (next.length < start + lines.length) next.push(emptyRow(next.at(-1)?.locationId ?? firstLocation));
      lines.forEach((cells, i) => {
        const [name = "", type = "", comps = "", qty = "", loc = "", box = ""] = withoutType
          ? [cells[0], "", ...cells.slice(1)]
          : cells;
        const prev = next[start + i];
        const locMatch = loc
          ? locations.find((l) => l.name.toLowerCase() === loc.toLowerCase()) ??
            (() => {
              const starts = locations.filter((l) => l.name.toLowerCase().startsWith(loc.toLowerCase()));
              return starts.length === 1 ? starts[0] : undefined;
            })()
          : undefined;
        const locationId = locMatch ? String(locMatch.id) : prev.locationId;
        const boxId = parseBoxCode(box);
        const boxOk = boxId && boxes.some((b) => b.id === boxId && String(b.locationId) === locationId);
        next[start + i] = {
          ...prev,
          name,
          type,
          typeTouched: Boolean(type),
          companies: comps,
          quantity: qty.replace(/[^0-9]/g, ""),
          locationId,
          boxId: boxOk ? String(boxId) : "",
        };
      });
      return next;
    });
    toast("success", `Pasted ${lines.length} row${lines.length === 1 ? "" : "s"}.`);
  }

  async function save() {
    setSaved(null);
    const payload = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => isFilled(r))
      .map(({ r, i }) => {
        const matches = itemsByName.get(r.name.trim().toLowerCase()) ?? [];
        const existing = !r.forceNew && matches.length === 1 ? matches[0].id : null;
        return {
          row: i + 1,
          name: r.name,
          type: typeOf(r) || null,
          companies: r.companies,
          quantity: Number.parseInt(r.quantity || "0", 10),
          locationId: Number(r.locationId),
          boxId: r.boxId ? Number(r.boxId) : null,
          existingItemId: existing,
        };
      });
    const form = new FormData();
    form.set("requestId", requestId.current());
    form.set("rows", JSON.stringify(payload));
    const result = await run(form);
    if (!result) return;
    if (!result.ok) {
      setRowErrors(result.fieldErrors ?? {});
      return;
    }
    requestId.renew();
    router.refresh(); // so the new items are recognised as existing in the next batch
    setRowErrors({});
    setSaved(result.message ?? "Saved.");
    toast("success", result.message ?? "Saved.");
    const keepLocation = rows.filter(isFilled).at(-1)?.locationId ?? firstLocation;
    setRows(Array.from({ length: 10 }, () => emptyRow(keepLocation)));
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 text-sm text-gray-700">
        <p>
          <strong>Tab</strong> moves right, <strong>Enter</strong> moves down, <strong>Ctrl+D</strong> copies the cell above.
          You can <strong>paste rows from a spreadsheet</strong> into a Name cell (columns: name, type, companies,
          quantity, location, box; the type column may be left out). Companies can be typed as names, the start of a
          name, or initials (e.g. <em>FF, NL</em>).
        </p>
        <p className="mt-1">
          <strong>Type</strong> is optional (e.g. <em>Banner</em>). It is suggested from the name, and a type that
          doesn&apos;t exist yet is added to the list when you save.
        </p>
      </Card>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table ref={tableRef} className="w-full min-w-[1060px] border-collapse text-left">
          <thead className="bg-gray-50 text-sm text-gray-600">
            <tr>
              <th className="w-10 px-2 py-2">#</th>
              <th className="px-2 py-2">Name</th>
              <th className="w-40 px-2 py-2">Type (optional)</th>
              <th className="w-56 px-2 py-2">Companies</th>
              <th className="w-24 px-2 py-2">Quantity</th>
              <th className="w-52 px-2 py-2">Location</th>
              <th className="w-36 px-2 py-2">Box (optional)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const filled = isFilled(r);
              const matches = itemsByName.get(r.name.trim().toLowerCase()) ?? [];
              const existing = !r.forceNew && matches.length === 1 ? matches[0] : null;
              const repeatOf = sameAsRow.get(i);
              const companyCheck = filled && !existing && !repeatOf ? matchCompanies(r.companies, companies) : null;
              const companyNames = companyCheck?.ids.map((id) => companies.find((c) => c.id === id)?.name).join(", ");
              const type = existing || repeatOf ? "" : typeOf(r);
              const typeNote = !type
                ? null
                : !knownType(type)
                  ? "New type: added when you save"
                  : !r.typeTouched
                    ? "Suggested from the name"
                    : null;
              const err = rowErrors[`row-${i + 1}`];
              const boxesHere = boxes.filter((b) => String(b.locationId) === r.locationId);
              return (
                <tr key={r.key} className={cx("border-t border-gray-100 align-top", err && "bg-red-50")}>
                  <td className="px-2 py-1.5 text-sm text-gray-500">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      data-cell={`${i}:0`}
                      value={r.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i, 0)}
                      onPaste={(e) => onPaste(e, i)}
                      className={cell}
                      aria-label={`Row ${i + 1} name`}
                    />
                    {existing && (
                      <p className="mt-0.5 text-xs text-brand-800">
                        Adds stock to the existing item.{" "}
                        <button type="button" className="underline" onClick={() => update(i, { forceNew: true })}>
                          Create a new item instead
                        </button>
                      </p>
                    )}
                    {r.forceNew && matches.length > 0 && (
                      <p className="mt-0.5 text-xs text-gray-600">
                        Will create a new item.{" "}
                        <button type="button" className="underline" onClick={() => update(i, { forceNew: false })}>
                          Use the existing one
                        </button>
                      </p>
                    )}
                    {repeatOf && <p className="mt-0.5 text-xs text-brand-800">Same item as row {repeatOf}: adds stock to it.</p>}
                    {!r.forceNew && matches.length > 1 && (
                      <p className="mt-0.5 text-xs text-amber-800">Several items have this name, so a new one will be created.</p>
                    )}
                    {err && <p className="mt-0.5 text-xs font-medium text-red-700">{err}</p>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      data-cell={`${i}:1`}
                      value={type}
                      disabled={Boolean(existing || repeatOf)}
                      placeholder={existing ? "(existing item)" : repeatOf ? `(as row ${repeatOf})` : ""}
                      onChange={(e) => update(i, { type: e.target.value, typeTouched: true })}
                      onKeyDown={(e) => onKeyDown(e, i, 1)}
                      list="bulk-types"
                      maxLength={40}
                      className={cx(cell, "disabled:bg-gray-50")}
                      aria-label={`Row ${i + 1} type`}
                    />
                    {typeNote && (
                      <p className={cx("mt-0.5 text-xs", knownType(type) ? "text-gray-600" : "text-brand-800")}>{typeNote}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      data-cell={`${i}:2`}
                      value={existing || repeatOf ? "" : r.companies}
                      disabled={Boolean(existing || repeatOf)}
                      placeholder={existing ? "(existing item)" : repeatOf ? `(as row ${repeatOf})` : ""}
                      onChange={(e) => update(i, { companies: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i, 2)}
                      list="bulk-companies"
                      className={cx(cell, companyCheck?.error && r.companies.trim() && "border-red-400", "disabled:bg-gray-50")}
                      aria-label={`Row ${i + 1} companies`}
                    />
                    {companyCheck && r.companies.trim() && (
                      <p className={cx("mt-0.5 text-xs", companyCheck.error ? "text-red-700" : "text-gray-600")}>
                        {companyCheck.error ?? companyNames}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      data-cell={`${i}:3`}
                      value={r.quantity}
                      inputMode="numeric"
                      onChange={(e) => update(i, { quantity: e.target.value.replace(/[^0-9]/g, "") })}
                      onKeyDown={(e) => onKeyDown(e, i, 3)}
                      className={cx(cell, "text-right")}
                      aria-label={`Row ${i + 1} quantity`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      data-cell={`${i}:4`}
                      value={r.locationId}
                      onChange={(e) => update(i, { locationId: e.target.value, boxId: "" })}
                      onKeyDown={(e) => onKeyDown(e, i, 4)}
                      className={cell}
                      aria-label={`Row ${i + 1} location`}
                    >
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      data-cell={`${i}:5`}
                      value={r.boxId}
                      onChange={(e) => update(i, { boxId: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i, 5)}
                      className={cell}
                      aria-label={`Row ${i + 1} box`}
                    >
                      <option value="">— loose —</option>
                      {boxesHere.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="bulk-types">
          {types.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <datalist id="bulk-companies">
          {companies.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setRows((rs) => [...rs, ...Array.from({ length: 10 }, () => emptyRow(rs.at(-1)?.locationId ?? firstLocation))])}>
          + 10 rows
        </Button>
        <Button onClick={save} disabled={pending || filledCount === 0} className="min-w-48">
          {pending ? "Saving…" : filledCount ? `Save ${filledCount} row${filledCount === 1 ? "" : "s"}` : "Fill in some rows"}
        </Button>
      </div>
      {error && <FormError message={error} />}
      {saved && (
        <p className="rounded-xl bg-green-50 p-3 text-green-900 ring-1 ring-green-200">
          {saved}{" "}
          <Link href="/items?missingPhoto=1" className="font-semibold underline">
            Add photos to items that don&apos;t have one →
          </Link>
        </p>
      )}
    </div>
  );
}
