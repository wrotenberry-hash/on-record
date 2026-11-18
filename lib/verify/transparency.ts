import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { integrityCounts } from "@/db/schema";

/** Monthly aggregate counts for the transparency note: accounts blocked, positions quarantined and accounts set aside for review, by reason. No ids. */
export async function transparencyMonths(limit = 12) {
  const rows = await getDb().select().from(integrityCounts).where(inArray(integrityCounts.kind, ["account_blocked", "position_quarantined", "account_held"])).orderBy(desc(integrityCounts.month));
  const months = new Map<string, { blocked: Record<string, number>; quarantined: Record<string, number>; held: Record<string, number> }>();
  for (const r of rows) {
    const m = months.get(r.month) ?? { blocked: {}, quarantined: {}, held: {} };
    (r.kind === "account_blocked" ? m.blocked : r.kind === "account_held" ? m.held : m.quarantined)[r.reason] = r.n;
    months.set(r.month, m);
  }
  return [...months].slice(0, limit).map(([month, v]) => ({ month, ...v }));
}
