/**
 * Turn typed company text ("FF, Nordic Labs") into company ids, for the bulk
 * entry grid. Each comma-separated part may be:
 *   - the full name (any case)            "Functional Future"
 *   - the initials                        "FF", "NL", "DNA"
 *   - the start of the name               "func", "simply"
 * Anything that matches several companies, or none, is reported instead of guessed.
 */
export type CompanyOption = { id: number; name: string };

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toLowerCase();
}

export function matchCompanies(text: string, companies: CompanyOption[]): { ids: number[]; error?: string } {
  const parts = text
    .split(/[,;]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return { ids: [], error: "Enter at least one company." };

  const ids: number[] = [];
  for (const part of parts) {
    const exact = companies.filter((c) => c.name.toLowerCase() === part);
    const byInitials = companies.filter((c) => initials(c.name) === part.replace(/[\s.]/g, ""));
    const byPrefix = companies.filter((c) => c.name.toLowerCase().startsWith(part));
    const byWord = companies.filter((c) => c.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(part)));
    const found = [exact, byInitials, byPrefix, byWord].find((list) => list.length > 0) ?? [];
    if (found.length === 0) return { ids: [], error: `No company matches "${part}".` };
    if (found.length > 1) {
      return { ids: [], error: `"${part}" could be ${found.map((c) => c.name).join(" or ")}. Type more of the name.` };
    }
    if (!ids.includes(found[0].id)) ids.push(found[0].id);
  }
  return { ids };
}
