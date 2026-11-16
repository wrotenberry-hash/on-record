import { READER_S } from "@/lib/analysis/publish-gate";
import { getDb } from "@/db";
import { officialBills, officialPoliticians } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { billLabel } from "@/components/federal/badges";
import { ISSUE_WORDS, rank, type Doc } from "@/lib/search-rank";

/** Round B: loads the searchable record (bills, current members, issues) and ranks it. A few thousand rows; cached for a minute. */
let cache: { at: number; docs: Doc[] } | null = null;
async function docs() {
  if (cache && Date.now() - cache.at < 60_000) return cache.docs;
  const db = getDb();
  const [bills, members] = await Promise.all([
    db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title, latestActionAt: officialBills.latestActionAt,
      headline: sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialBills.id} and ${READER_S} order by s.created_at desc limit 1)`,
      subjects: sql<string | null>`(select group_concat(x.subject, ' ') from official_bill_subjects x where x.bill_id = ${officialBills.id})` }).from(officialBills),
    db.select().from(officialPoliticians).where(eq(officialPoliticians.isCurrent, 1)),
  ]);
  const out: Doc[] = [
    ...ISSUE_CATEGORIES.map(c => ({ kind: "issue" as const, id: c.slug, title: c.name, extra: ISSUE_WORDS[c.slug], href: `/issues/${c.slug}`, meta: "Issue" })),
    ...members.map(m => ({ kind: "member" as const, id: m.id, title: m.fullName, extra: `${m.state} ${m.party} ${m.chamber === "senate" ? "senator" : "representative congressman congresswoman"}`,
      href: `/politicians/${m.id}`, meta: `${m.chamber === "senate" ? "Senator" : "Representative"} · ${m.party} · ${m.state}${m.district ? `-${m.district}` : ""}` })),
    ...bills.map(b => ({ kind: "bill" as const, id: b.id, title: b.title, label: billLabel(b.billType, b.number), extra: `${b.headline ?? ""} ${b.subjects ?? ""}`,
      href: `/bills/${b.id}`, meta: `${billLabel(b.billType, b.number)}${b.latestActionAt ? ` · latest action ${b.latestActionAt}` : ""}` })),
  ];
  cache = { at: Date.now(), docs: out };
  return out;
}

export async function search(q: string) {
  const all = await docs();
  return rank(q.slice(0, 120), all, 40);
}
