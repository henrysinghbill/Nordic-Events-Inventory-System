import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { photoFilePath } from "@/server/photos";

/**
 * Serves a photo only to signed-in users.  /api/photos/{key}  or  ?size=thumb
 */
export async function GET(request: Request, ctx: RouteContext<"/api/photos/[key]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const { key } = await ctx.params;
  const photo = await db.photo.findUnique({ where: { key }, select: { key: true } });
  if (!photo) return new Response("Not found", { status: 404 });

  const variant = new URL(request.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  try {
    const data = await readFile(photoFilePath(photo.key, variant));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        // Keys are never reused, so the browser may keep it — but only privately.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Photo file missing", { status: 404 });
  }
}
