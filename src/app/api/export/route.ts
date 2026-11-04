import { todayIn } from "@/lib/days";
import { getCurrentUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { db } from "@/server/db";
import { inventoryWorkbook } from "@/server/export";

/** Download the whole inventory as an Excel workbook (any signed-in user). */
export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: "Not signed in" }, { status: 401 });
  const tz = config().APP_TIMEZONE;
  const file = await inventoryWorkbook(db, tz);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nordic-inventory-${todayIn(tz)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
