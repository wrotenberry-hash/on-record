/**
 * The three kinds of share card, read from the database (owner's point 10): one roll call's result, one change
 * between two versions of a bill, and one district's total. Each returns a card with ONE fact (lib/card-content.ts)
 * or null when the record does not support it. Every function takes the database handle, so
 * tests/share-entry.test.mjs builds the same cards from a temporary database.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { analysisVersionChanges, officialBillTexts, officialBills, officialRollCalls, officialTallyChecks, txBills, voiceTotals } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import { totalsForBill } from "../constituent/store.ts";
import { KIND_LABEL, voteKind } from "../federal/vote-kinds.ts";
import { CHANGE_KEY, changeCard, changeItems, rollCard, totalCard, type Card, type ChangeItem } from "../card-content.ts";
import { billLabel } from "./rules.ts";
import type { HeadlineLoader } from "./store.ts";

/** A district ("TX-37", "WY-AL", "TX-SD-14", "TX-HD-49") or a state ("TX"). Never the whole nation. */
export const TOTAL_SCOPE = /^[A-Z]{2}(-(\d{2}|AL)|-(SD|HD)-\d{1,3})?$/;

type BillIdentity = { key: string; label: string; title: string; textUrl: string };
export async function billIdentity(db: Db, billKey: string): Promise<BillIdentity | null> {
  const f = await db.select({ billType: officialBills.billType, number: officialBills.number, title: officialBills.title, url: officialBills.congressUrl }).from(officialBills).where(eq(officialBills.id, billKey)).get();
  if (f) return { key: billKey, label: billLabel(f.billType, f.number), title: f.title, textUrl: `${f.url.replace(/\/$/, "")}/text` };
  const t = await db.select({ identifier: txBills.identifier, title: txBills.title, url: txBills.tloUrl }).from(txBills).where(eq(txBills.id, billKey)).get();
  return t ? { key: billKey, label: t.identifier, title: t.title, textUrl: t.url } : null;
}
const headlineOf = async (headlines: HeadlineLoader | undefined, billKey: string) => (headlines ? (await headlines([billKey]).catch(() => new Map<string, string>())).get(billKey) ?? null : null);

/** A VOTE: one roll call's result, in the official wording, with the count unless it is under review. */
export async function rollCardFor(db: Db, rollId: string, opts: { headlines?: HeadlineLoader; eyebrow?: string } = {}): Promise<{ card: Card; billKey: string | null } | null> {
  const r = await db.select({ rc: officialRollCalls, bad: officialTallyChecks.rollCallId }).from(officialRollCalls)
    .leftJoin(officialTallyChecks, and(eq(officialTallyChecks.rollCallId, officialRollCalls.id), eq(officialTallyChecks.ok, 0))).where(eq(officialRollCalls.id, rollId)).get();
  if (!r) return null;
  const bill = r.rc.billId ? await billIdentity(db, r.rc.billId) : null, kind = voteKind(r.rc.question, bill?.title ?? r.rc.title);
  return { billKey: bill?.key ?? null, card: rollCard({ billLabel: bill?.label ?? r.rc.documentLabel ?? "Recorded vote", billTitle: bill?.title ?? r.rc.title ?? r.rc.question,
    headline: bill ? await headlineOf(opts.headlines, bill.key) : null, chamber: r.rc.chamber, question: r.rc.question, result: r.rc.result, yea: r.rc.yea, nay: r.rc.nay, tallyOk: !r.bad,
    kind, kindLabel: KIND_LABEL[kind], votedAt: r.rc.votedAt, sourceUrl: r.rc.sourceUrl }, opts.eyebrow) };
}

/** The changes the bill page lists between a bill's two latest text versions, each with the key a link names it by. */
export async function billChanges(db: Db, billKey: string): Promise<{ fromType: string; toType: string; createdAt: number; items: ChangeItem[] } | null> {
  const row = await db.select().from(analysisVersionChanges).where(and(eq(analysisVersionChanges.billId, billKey), sql`${analysisVersionChanges.status} <> 'failed'`))
    .orderBy(desc(analysisVersionChanges.createdAt)).limit(1).get();
  return row ? { fromType: row.fromType, toType: row.toType, createdAt: row.createdAt, items: changeItems(row) } : null;
}
/** A BILL CHANGE: one of those changes. Dated by the newer text version; sourced to that version's official text. */
export async function changeCardFor(db: Db, billKey: string, key: string): Promise<Card | null> {
  if (!CHANGE_KEY.test(key)) return null;
  const [bill, changes] = await Promise.all([billIdentity(db, billKey), billChanges(db, billKey)]);
  const item = changes?.items.find(i => i.key === key);
  if (!bill || !changes || !item) return null;
  const text = await db.select().from(officialBillTexts).where(and(eq(officialBillTexts.billId, billKey), eq(officialBillTexts.type, changes.toType))).get();
  return changeCard({ billLabel: bill.label, billTitle: bill.title, fromType: changes.fromType, toType: changes.toType, item, at: text?.date ?? changes.createdAt,
    sourceUrl: text?.htmlUrl ?? text?.pdfUrl ?? text?.xmlUrl ?? bill.textUrl });
}

/** A DISTRICT TOTAL: what counted residents of one district (or one state) said on one bill. Null below 25 counted voters. */
export async function totalCardFor(db: Db, billKey: string, scope: string): Promise<Card | null> {
  if (!TOTAL_SCOPE.test(scope) || scope === "US") return null;
  const bill = await billIdentity(db, billKey);
  if (!bill) return null;
  const totals = (await totalsForBill(db, billKey, [scope])).get(scope);
  const at = await db.select({ at: sql<number | null>`max(${voiceTotals.updatedAt})` }).from(voiceTotals).where(and(eq(voiceTotals.billKey, billKey), eq(voiceTotals.scope, scope))).get();
  return totalCard({ billLabel: bill.label, billTitle: bill.title, scope, kind: /^[A-Z]{2}$/.test(scope) ? "state" : "district", totals, updatedAt: Number(at?.at ?? 0) || Date.now() });
}
