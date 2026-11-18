import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { CSV_FILE, totalsCsv } from "@/lib/associations/rules";
import { associationsEnabled, currentAssociationAdmin } from "@/lib/associations/session";
import { viewForAdmin } from "@/lib/associations/store";

export const dynamic = "force-dynamic";

/**
 * The file to download: the same rows the page shows (`viewForAdmin`), written out by `totalsCsv`. It takes nothing
 * from the address, so it can only ever be the signed-in administrator's own association.
 */
export async function GET() {
  if (!associationsEnabled()) return new NextResponse("Not found", { status: 404 });
  const admin = await currentAssociationAdmin();
  const view = admin ? await viewForAdmin(getDb(), admin.adminId) : null;
  if (!view) return new NextResponse("Sign in at /association first.", { status: 401 });
  return new NextResponse(totalsCsv(view.rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${CSV_FILE}"`, "Cache-Control": "private, no-store" } });
}
