import { getCurrentUser } from "@/server/auth/session";
import { itemNameMatches } from "@/server/queries";

/** Existing items whose name matches what's being typed (quick-add, bulk entry). */
export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Not signed in" }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ items: [] });
  const items = await itemNameMatches(q);
  return Response.json({
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      photoKey: i.photos[0]?.key ?? null,
      companyIds: i.companies.map((c) => c.companyId),
    })),
  });
}
