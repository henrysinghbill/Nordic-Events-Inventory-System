/** Reasons for a count / adjustment (shared by the form and the server). */
export const ADJUST_REASONS = [
  { value: "USED_AT_EVENT", label: "Used at event" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "LOST", label: "Lost" },
  { value: "FOUND", label: "Found" },
  { value: "CORRECTION", label: "Correction" },
] as const;

export type AdjustReason = (typeof ADJUST_REASONS)[number]["value"];

export function reasonLabel(value: string): string | undefined {
  return ADJUST_REASONS.find((r) => r.value === value)?.label;
}
