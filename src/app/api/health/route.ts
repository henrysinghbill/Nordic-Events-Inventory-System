import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { config } from "@/server/config";
import { db } from "@/server/db";

/**
 * Health check for monitoring and the platform (Docker, Railway, a reverse proxy).
 * No login needed, and it reveals nothing about the data.
 *   200 {"status":"ok", ...}      everything works
 *   503 {"status":"error", ...}   the database or the photo folder isn't usable
 */
export const dynamic = "force-dynamic";

async function check(fn: () => Promise<unknown>): Promise<"ok" | "error"> {
  try {
    await fn();
    return "ok";
  } catch (err) {
    console.error("[health]", err);
    return "error";
  }
}

export async function GET() {
  const [database, photos] = await Promise.all([
    check(() => db.$queryRaw`SELECT 1`),
    check(async () => {
      const dir = config().uploadDirAbsolute;
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
    }),
  ]);
  const ok = database === "ok" && photos === "ok";
  return Response.json(
    { status: ok ? "ok" : "error", database, photos, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
