/**
 * Resident voting: the database side of lib/constituent/rules.ts. Every function takes the database handle and
 * reads no request and no secret, so tests/constituent.test.mjs runs these same functions against a temporary
 * database built from the real migrations.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { billJurisdictions, officialBills, opinionUserVotes, positionHistory, positionResidences, readerAccounts, readerUnsure, txBills, voiceLegacyChoices, voiceTotals, voiceVotes } from "../../db/schema.ts";
import { tally, tierOf, voteCounts, type Answer, type Counts, type CountedTier, type Jurisdiction, type ScopeTotals, type VoteFacts } from "./rules.ts";
import { stampPosition, type Db } from "../verify/residence-store.ts";

/* ───────────────────────────── Jurisdiction, stored per bill ───────────────────────────── */

/**
 * The bill's jurisdiction. It is stored once per bill (bill_jurisdictions): the first time a bill is asked about, the
 * row is written from the table the bill lives in. A new state's loader writes its own rows; nothing here names a state
 * except the one existing state table.
 */
export async function jurisdictionOf(db: Db, billKey: string, now = Date.now()): Promise<Jurisdiction | null> {
  const row = await db.select().from(billJurisdictions).where(eq(billJurisdictions.billKey, billKey)).get();
  if (row) return { code: row.jurisdiction, level: row.level as "federal" | "state" };
  const federal = await db.select({ id: officialBills.id }).from(officialBills).where(eq(officialBills.id, billKey)).get();
  const j: Jurisdiction | null = federal ? { code: "US", level: "federal" }
    : (await db.select({ id: txBills.id }).from(txBills).where(eq(txBills.id, billKey)).get()) ? { code: "TX", level: "state" } : null;
  if (j) await db.insert(billJurisdictions).values({ billKey, jurisdiction: j.code, level: j.level, setAt: now }).onConflictDoNothing();
  return j;
}
export async function setJurisdiction(db: Db, billKey: string, j: Jurisdiction, now = Date.now()) {
  await db.insert(billJurisdictions).values({ billKey, jurisdiction: j.code, level: j.level, setAt: now }).onConflictDoUpdate({ target: billJurisdictions.billKey, set: { jurisdiction: j.code, level: j.level, setAt: now } });
}

/* ───────────────────────────── A reader's own answers ───────────────────────────── */

export async function voteOf(db: Db, userId: string, billKey: string) {
  return (await db.select().from(voiceVotes).where(and(eq(voiceVotes.userId, userId), eq(voiceVotes.billKey, billKey))).get()) ?? null;
}
export async function votesOf(db: Db, userId: string) { return db.select().from(voiceVotes).where(eq(voiceVotes.userId, userId)); }

export type CastInput = { userId: string; accountId: string | null; billKey: string; answer: Answer | null; reason: string | null; reasonHash: string | null; device: string | null; ipRange: string | null; now: number;
  /** 1 (default): may count. -1: saved as a private position because a check did not pass when it was given (too many answers in an hour, or the bot check); answering again clears it. */
  counts?: 1 | -1 };
/**
 * Saves, changes or clears an answer and keeps the change in the history. An answer given now is given under the new
 * promise, so it may count (`counts` = 1) if everything else allows. It takes the account's home if it has none yet.
 */
export async function castVote(db: Db, i: CastInput) {
  if (!i.answer) await db.delete(voiceVotes).where(and(eq(voiceVotes.userId, i.userId), eq(voiceVotes.billKey, i.billKey)));
  else await db.insert(voiceVotes).values({ userId: i.userId, billKey: i.billKey, accountId: i.accountId, answer: i.answer, reason: i.reason, reasonHash: i.reasonHash, counts: i.counts ?? 1,
    device: i.device, ipRange: i.ipRange, createdAt: i.now, updatedAt: i.now })
    .onConflictDoUpdate({ target: [voiceVotes.userId, voiceVotes.billKey], set: { answer: i.answer, accountId: i.accountId, reason: i.reason, reasonHash: i.reasonHash, counts: i.counts ?? 1, device: i.device, ipRange: i.ipRange, updatedAt: i.now } });
  await db.insert(positionHistory).values({ id: crypto.randomUUID(), userId: i.userId, billId: i.billKey, stance: i.answer ?? "cleared", reason: i.reason, at: i.now });
  if (i.answer && i.accountId) await stampPosition(db, { userId: i.userId, billId: i.billKey, accountId: i.accountId }, i.now);
}

/** When a reader signs in, the answers they gave on this device before join their account. */
export async function attachVotesToAccount(db: Db, userId: string, accountId: string) {
  await db.update(voiceVotes).set({ accountId }).where(and(eq(voiceVotes.userId, userId), sql`${voiceVotes.accountId} is null`));
}

/* ───────────────────────────── Answers given under the old promise ───────────────────────────── */

/**
 * Copies a reader's earlier answers (Support and Oppose from opinion_user_votes, Unsure from reader_unsure) into
 * voice_votes once, marked uncounted. Safe to call on every visit: it does nothing after the first time.
 * Returns how many answers still wait for the reader's choice.
 */
export async function importLegacy(db: Db, userId: string, now = Date.now()): Promise<{ pending: number; choice: "count" | "private" | null }> {
  const done = await db.select().from(voiceLegacyChoices).where(eq(voiceLegacyChoices.userId, userId)).get();
  if (!done) {
    const account = await db.select({ id: readerAccounts.id }).from(readerAccounts).where(eq(readerAccounts.appUserId, userId)).get();
    const [stances, unsure] = await Promise.all([db.select().from(opinionUserVotes).where(eq(opinionUserVotes.userId, userId)), db.select().from(readerUnsure).where(eq(readerUnsure.userId, userId))]);
    const rows = [...stances.map(s => ({ billKey: s.billId, answer: s.stance as Answer, at: s.updatedAt })), ...unsure.map(u => ({ billKey: u.billId, answer: "unsure" as Answer, at: u.updatedAt }))];
    let imported = 0;
    for (const r of rows) imported += (await db.insert(voiceVotes).values({ userId, billKey: r.billKey, accountId: account?.id ?? null, answer: r.answer, counts: 0, createdAt: r.at, updatedAt: r.at })
      .onConflictDoNothing().returning({ b: voiceVotes.billKey })).length;
    await db.insert(voiceLegacyChoices).values({ userId, imported, importedAt: now }).onConflictDoNothing();
  }
  const choice = (done?.choice ?? null) as "count" | "private" | null;
  if (choice) return { pending: 0, choice };
  const pending = Number((await db.select({ n: sql<number>`count(*)` }).from(voiceVotes).where(and(eq(voiceVotes.userId, userId), eq(voiceVotes.counts, 0))).get())?.n ?? 0);
  return { pending, choice };
}

/** The reader's choice about their earlier answers. "count": they may count from now on. "private": they stay uncounted. Asked once. */
export async function decideLegacy(db: Db, userId: string, choice: "count" | "private", now = Date.now()): Promise<string[]> {
  await importLegacy(db, userId, now);
  const rows = await db.select({ billKey: voiceVotes.billKey, accountId: voiceVotes.accountId }).from(voiceVotes).where(and(eq(voiceVotes.userId, userId), eq(voiceVotes.counts, 0)));
  if (choice === "count") {
    await db.update(voiceVotes).set({ counts: 1 }).where(and(eq(voiceVotes.userId, userId), eq(voiceVotes.counts, 0)));
    for (const r of rows) if (r.accountId) await stampPosition(db, { userId, billId: r.billKey, accountId: r.accountId }, now);
  }
  await db.update(voiceLegacyChoices).set({ choice, decidedAt: now }).where(eq(voiceLegacyChoices.userId, userId));
  return choice === "count" ? rows.map(r => r.billKey) : [];
}

/* ───────────────────────────── Totals ───────────────────────────── */

/** Every answer on a bill with the facts the counting rule needs. One query; the rule itself is lib/constituent/rules.ts. */
export async function voteFacts(db: Db, billKey: string, onlyUserId?: string): Promise<VoteFacts[]> {
  const all = await db.select({ answer: voiceVotes.answer, counts: voiceVotes.counts, accountId: voiceVotes.accountId, updatedAt: voiceVotes.updatedAt,
    accountCreatedAt: sql<number | null>`(select a.created_at from reader_accounts a where a.id = ${voiceVotes.accountId})`,
    emailVerifiedAt: sql<number | null>`(select a.verified_at from reader_accounts a where a.id = ${voiceVotes.accountId})`,
    phoneVerifiedAt: sql<number | null>`(select p.phone_verified_at from verification_profiles p where p.account_id = ${voiceVotes.accountId} and p.phone_hash is not null)`,
    hasHome: sql<number>`exists (select 1 from account_residences r where r.account_id = ${voiceVotes.accountId})`,
    mailVerified: sql<number>`exists (select 1 from mail_verifications m join account_residences r on r.account_id = m.account_id and r.address_key = m.address_key where m.account_id = ${voiceVotes.accountId} and m.revoked_at is null)`,
    quarantined: sql<number>`exists (select 1 from flagged_positions fp join integrity_flags f on f.id = fp.flag_id where fp.user_id = ${voiceVotes.userId} and fp.bill_id = ${voiceVotes.billKey} and f.status in ('open', 'confirmed'))`,
    held: sql<number>`exists (select 1 from account_holds h where h.account_id = ${voiceVotes.accountId} and h.status in ('open', 'confirmed'))`,
    congressional: positionResidences.congressional, state: positionResidences.stateCode, stateUpper: positionResidences.stateUpper, stateLower: positionResidences.stateLower })
    .from(voiceVotes).leftJoin(positionResidences, and(eq(positionResidences.userId, voiceVotes.userId), eq(positionResidences.billId, voiceVotes.billKey)))
    .where(onlyUserId ? and(eq(voiceVotes.billKey, billKey), eq(voiceVotes.userId, onlyUserId)) : eq(voiceVotes.billKey, billKey));
  // One person, one vote: an account that answered the same bill from two devices (two reader ids) has two rows.
  // Only its latest answer is a candidate to count; the earlier one stays that device's private position.
  const latest = new Map<string, number>();
  for (const r of all) if (r.accountId) latest.set(r.accountId, Math.max(latest.get(r.accountId) ?? 0, r.updatedAt));
  const kept = new Set<string>();
  const rows = onlyUserId ? all : all.filter(r => { if (!r.accountId) return true; if (r.updatedAt !== latest.get(r.accountId) || kept.has(r.accountId)) return false; kept.add(r.accountId); return true; });
  return rows.map(r => ({ answer: r.answer as Answer, consent: r.counts === 1,
    tier: tierOf(r.accountId ? { emailVerifiedAt: r.emailVerifiedAt, phoneVerifiedAt: r.phoneVerifiedAt, hasHome: Number(r.hasHome) === 1, mailVerified: Number(r.mailVerified) === 1 } : null),
    accountCreatedAt: r.accountCreatedAt === null ? null : Number(r.accountCreatedAt), quarantined: Number(r.quarantined) === 1, held: Number(r.held) === 1,
    home: r.congressional && r.state ? { congressional: r.congressional, state: r.state, stateUpper: r.stateUpper, stateLower: r.stateLower } : null }));
}

/** Rebuilds one bill's totals from its answers. A bill with no stored jurisdiction and no known table has no totals. */
export async function recomputeVoice(db: Db, billKey: string, now = Date.now()): Promise<Map<string, Counts>> {
  const j = await jurisdictionOf(db, billKey, now);
  const totals = j ? tally(await voteFacts(db, billKey), j, now) : new Map<string, Counts>();
  await db.delete(voiceTotals).where(eq(voiceTotals.billKey, billKey));
  const values = [...totals].map(([k, t]) => { const [scope, tier] = k.split("|"); return { billKey, scope, tier: tier as CountedTier, ...t, updatedAt: now }; });
  if (values.length) await db.insert(voiceTotals).values(values);
  return totals;
}

/** Every bill with an answer (each scheduled update: accounts pass the 24-hour line over time). */
export async function recomputeAllVoice(db: Db, now = Date.now()): Promise<number> {
  const bills = await db.selectDistinct({ billKey: voiceVotes.billKey }).from(voiceVotes);
  for (const b of bills) await recomputeVoice(db, b.billKey, now);
  return bills.length;
}

const group = (rows: Array<{ scope: string; tier: string; support: number; oppose: number; unsure: number }>, key: (r: { scope: string }) => string) => {
  const out = new Map<string, ScopeTotals>();
  for (const r of rows) { const t = out.get(key(r)) ?? { mail: null, address: null }; t[r.tier as CountedTier] = { support: r.support, oppose: r.oppose, unsure: r.unsure }; out.set(key(r), t); }
  return out;
};
/** One bill's totals in the scopes asked for (the nation, a state, a district), each split into its two groups. */
export async function totalsForBill(db: Db, billKey: string, scopes: readonly string[]): Promise<Map<string, ScopeTotals>> {
  if (!scopes.length) return new Map();
  return group(await db.select().from(voiceTotals).where(and(eq(voiceTotals.billKey, billKey), inArray(voiceTotals.scope, [...scopes]))), r => r.scope);
}
/** One scope's totals (a district or a state) for many bills, keyed by bill. */
export async function totalsForScope(db: Db, scope: string, billKeys: readonly string[]): Promise<Map<string, ScopeTotals>> {
  if (!billKeys.length) return new Map();
  const rows = await db.select().from(voiceTotals).where(and(eq(voiceTotals.scope, scope), inArray(voiceTotals.billKey, [...billKeys])));
  return group(rows.map(r => ({ ...r, scope: r.billKey })), r => r.scope);
}
/** Every bill that has a total in this scope, newest first (a legislator's district, an office dashboard). */
export async function billsWithTotals(db: Db, scope: string, limit = 200): Promise<string[]> {
  return (await db.selectDistinct({ billKey: voiceTotals.billKey, at: sql<number>`max(${voiceTotals.updatedAt})` }).from(voiceTotals).where(eq(voiceTotals.scope, scope))
    .groupBy(voiceTotals.billKey).orderBy(sql`max(${voiceTotals.updatedAt}) desc`).limit(limit)).map(r => r.billKey);
}

/** The counting facts of one reader's answer on one bill (to tell them whether it counts, and why not). */
export async function voteFactsFor(db: Db, userId: string, billKey: string): Promise<VoteFacts | null> {
  return (await voteFacts(db, billKey, userId))[0] ?? null;
}
/** Whether one reader's answer on one bill counts now, and if not, why. Null when they have not answered or the bill is unknown. */
export async function standingOfVote(db: Db, userId: string, billKey: string, now = Date.now()) {
  const [facts, j] = await Promise.all([voteFactsFor(db, userId, billKey), jurisdictionOf(db, billKey, now)]);
  return facts && j ? voteCounts(facts, j, now) : null;
}
/** How many of a reader's answers are counted right now (the mailed-code offer comes after the third). */
export async function countedVotesOf(db: Db, userId: string, now = Date.now()): Promise<number> {
  let n = 0;
  for (const b of await db.select({ billKey: voiceVotes.billKey }).from(voiceVotes).where(and(eq(voiceVotes.userId, userId), eq(voiceVotes.counts, 1))))
    if ((await standingOfVote(db, userId, b.billKey, now))?.counts) n++;
  return n;
}

/** Housekeeping: the scrambled device and network kept with an answer are cleared after 30 days unless the answer is under review. */
export async function purgeVoteSignals(db: Db, now = Date.now()) {
  await db.update(voiceVotes).set({ device: null, ipRange: null }).where(and(lt(voiceVotes.updatedAt, now - 30 * 86400e3), sql`(${voiceVotes.device} is not null or ${voiceVotes.ipRange} is not null)`,
    sql`not exists (select 1 from flagged_positions fp join integrity_flags f on f.id = fp.flag_id where fp.user_id = ${voiceVotes.userId} and fp.bill_id = ${voiceVotes.billKey} and f.status = 'open')`));
}
