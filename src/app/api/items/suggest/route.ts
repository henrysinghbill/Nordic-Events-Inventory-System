import { toId } from "@/lib/params";
import { getCurrentUser } from "@/server/auth/session";
import { suggestItems } from "@/server/queries";

/**
 * Existing items for the pickers that search as you type.
 *   ?q=roll up            items whose name contains every word (quick-add: "already exists?")
 *   ?q=banner&wide=1      also matches type, company and description (packing lists)
 *   ?type=3&wide=1        every item of a type, optionally narrowed down with q
 */
export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Not signed in" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const typeId = toId(params.get("type"));
  const wide = params.get("wide") === "1";
  if (q.length < 2 && !typeId) return Response.json({ items: [] });
  const items = await suggestItems({ q, typeId, wide, take: typeId ? 100 : wide ? 12 : 6 });
  return Response.json({ items });
}
