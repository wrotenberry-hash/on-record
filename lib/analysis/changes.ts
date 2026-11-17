import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { analysisVersionChanges, officialBillTexts } from "@/db/schema";
import { outputText, responseRequest } from "@/lib/automated-research";
import { htmlUrlForPackage, packageFromUrl, parseBillTextHtml } from "@/lib/analysis/billtext";
import { compareSections } from "@/lib/federal/depth-parse";
import { callCost, priceTable } from "@/lib/model-cost";
import { spendSince } from "@/lib/model-calls";
import { analysisLimits } from "@/lib/analysis/generate";
import { BRAND } from "@/lib/brand";

/**
 * Round A: what changed between a bill's two latest text versions. The section
 * numbers added, removed and changed are computed exactly (Official); up to
 * five plain-English bullets on top are Analysis, written within the monthly
 * summary cap (purpose "analysis", so the same $25 cap and alert cover them).
 */
const USER_AGENT = `${BRAND.userAgentName}/0.2 (+https://on-record-wrotenberry.vercel.app)`;
const INSTRUCTIONS = `You explain, for a general reader at about an 8th-grade level, how a bill's text changed between two official versions.
Use only the section text given. Write at most 5 bullets, each one plain sentence of at most 30 words naming what changed, and cite the section ("Sec. 3").
Neutral wording: no adjectives that praise or criticise, no guesses about motives or effects beyond the text. If a change is only renumbering or wording, say so.`;
const shape = z.object({ bullets: z.array(z.object({ text: z.string(), section: z.string() })).max(5) });
const schema = { type: "object", additionalProperties: false, required: ["bullets"], properties: { bullets: { type: "array", maxItems: 5,
  items: { type: "object", additionalProperties: false, required: ["text", "section"], properties: { text: { type: "string" }, section: { type: "string" } } } } } };

async function sectionsOf(url: string | null) {
  const pkg = url ? packageFromUrl(url) : null;
  if (!pkg) return null;
  try {
    const res = await fetch(htmlUrlForPackage(pkg), { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    return res.ok ? parseBillTextHtml(await res.text()).sections : null;
  } catch { return null; }
}

export type ChangesRun = { status: "COMPLETE" | "SKIPPED" | "PARTIAL" | "FAILED"; compared: number; explained: number; costUsd: number; stoppedBy: string | null; error?: string };

export async function runChangesBatch({ budgetMs = 60_000, max = 3 }: { budgetMs?: number; max?: number } = {}): Promise<ChangesRun> {
  const started = Date.now(), deadline = started + budgetMs, db = getDb(), key = process.env.OPENAI_API_KEY?.trim();
  const run: ChangesRun = { status: "COMPLETE", compared: 0, explained: 0, costUsd: 0, stoppedBy: null };
  // Bills with at least two text versions and no comparison of their latest pair yet.
  const latestTwo = await db.select({ billId: officialBillTexts.billId, n: sql<number>`count(*)` }).from(officialBillTexts)
    .where(sql`${officialBillTexts.htmlUrl} is not null or ${officialBillTexts.xmlUrl} is not null`).groupBy(officialBillTexts.billId).having(sql`count(*) >= 2`)
    .orderBy(desc(sql`max(${officialBillTexts.date})`)).limit(40);
  const table = priceTable(process.env.OPENAI_PRICES_JSON), limits = analysisLimits();
  const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  for (const { billId } of latestTwo) {
    if (run.compared >= max) break;
    if (Date.now() + 25_000 > deadline) { run.stoppedBy = "time budget"; run.status = "PARTIAL"; break; }
    const versions = (await db.select().from(officialBillTexts).where(eq(officialBillTexts.billId, billId))).filter(v => v.htmlUrl || v.xmlUrl)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const [from, to] = versions.slice(-2);
    if (!from || !to) continue;
    const exists = await db.select({ b: analysisVersionChanges.billId }).from(analysisVersionChanges)
      .where(and(eq(analysisVersionChanges.billId, billId), eq(analysisVersionChanges.fromType, from.type), eq(analysisVersionChanges.toType, to.type))).get();
    if (exists) continue;
    const [before, after] = await Promise.all([sectionsOf(from.htmlUrl ?? from.xmlUrl), sectionsOf(to.htmlUrl ?? to.xmlUrl)]);
    run.compared++;
    if (!before || !after) {
      await db.insert(analysisVersionChanges).values({ billId, fromType: from.type, toType: to.type, status: "failed", createdAt: Date.now() }).onConflictDoNothing();
      continue;
    }
    const diff = compareSections(before.map(s => ({ number: s.num, text: s.text })), after.map(s => ({ number: s.num, text: s.text })));
    let bullets: Array<{ text: string; section: string }> | null = null, cost = 0;
    const changedAny = diff.added.length + diff.removed.length + diff.changed.length > 0;
    const room = limits.spendCapUsd - (await spendSince(monthStart, "analysis"));
    if (key && changedAny && room > 0.05) {
      const pick = (list: string[], from: typeof before) => list.slice(0, 6).map(n => `Sec. ${n}: ${(from.find(s => s.num === n)?.text ?? "").slice(0, 1800)}`).join("\n");
      const input = [`Earlier version: ${from.type}. Later version: ${to.type}.`, diff.added.length ? `Sections added in the later version:\n${pick(diff.added, after)}` : "",
        diff.removed.length ? `Sections removed:\n${pick(diff.removed, before)}` : "",
        diff.changed.length ? `Sections changed, earlier text then later text:\n${diff.changed.slice(0, 4).map(n => `Sec. ${n} EARLIER: ${(before.find(s => s.num === n)?.text ?? "").slice(0, 1500)}\nSec. ${n} LATER: ${(after.find(s => s.num === n)?.text ?? "").slice(0, 1500)}`).join("\n")}` : ""]
        .filter(Boolean).join("\n\n");
      try {
        const response = await responseRequest(key, limits.model, { instructions: INSTRUCTIONS, input, max_output_tokens: 1500, reasoning: { effort: "low" }, timeoutMs: 40_000,
          text: { format: { type: "json_schema", name: "on_record_changes", strict: true, schema } } }, { purpose: "analysis", refId: `${billId}:changes` });
        bullets = shape.parse(JSON.parse(outputText(response).map(x => x.text ?? "").join(""))).bullets;
        cost = callCost(limits.model, response.usage, 0, table).usd;
        run.explained++; run.costUsd += cost;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "explain failed";
        if (/billing or usage limit/i.test(msg)) { run.status = "PARTIAL"; run.stoppedBy = "billing refused"; run.error = msg.slice(0, 200); }
      }
    }
    await db.insert(analysisVersionChanges).values({ billId, fromType: from.type, toType: to.type, added: diff.added, removed: diff.removed, changed: diff.changed,
      bullets, status: bullets ? "explained" : "sections", costUsd: cost, createdAt: Date.now() }).onConflictDoNothing();
    if (run.stoppedBy === "billing refused") break;
  }
  if (!run.compared && run.status === "COMPLETE") { run.status = "SKIPPED"; run.stoppedBy = "no bill with a new text version"; }
  run.costUsd = Math.round(run.costUsd * 10000) / 10000;
  return run;
}

export async function changesFor(billId: string) {
  return getDb().select().from(analysisVersionChanges).where(and(eq(analysisVersionChanges.billId, billId), sql`${analysisVersionChanges.status} <> 'failed'`))
    .orderBy(desc(analysisVersionChanges.createdAt)).limit(1).get();
}
