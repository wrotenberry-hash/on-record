import { getDb } from "@/db";
import { officeCsv, officeView, isoDay } from "@/lib/office/rules";
import { officeDashboard } from "@/lib/office/store";
import { currentOffice, officeDoor } from "@/lib/office/session";

export const dynamic = "force-dynamic";

/**
 * The dashboard as a spreadsheet file. Only for a signed-in, confirmed office, and only its own district. The rows
 * are written from the same `officeView` the dashboard page draws, so the file holds what the page shows and no more.
 */
export async function GET() {
  const gone = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!(await officeDoor()).allowed) return gone();
  const office = await currentOffice();
  if (!office || office.account.status !== "active" || !office.member?.current) return gone();
  const now = Date.now(), view = officeView(await officeDashboard(getDb(), office.member, now));
  const name = `office-totals-${office.member.scope.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${isoDay(now)}.csv`;
  // The first character tells a spreadsheet the file is UTF-8, so the "·" between numbers is read correctly.
  return new Response(`﻿${officeCsv(view)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
