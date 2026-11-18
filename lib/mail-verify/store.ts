/**
 * Mail-verified by postcard: the database side of lib/mail-verify/rules.ts. Every function takes the database handle
 * and reads no request and no secret, so tests/mail-verify.test.mjs runs these same functions against a temporary
 * database built from the real migrations. The code arrives already hashed (the caller does that); the plain code is
 * handed only to the sender, to print, and is never written anywhere.
 *
 * Tables (all existing): mail_codes and mail_verifications (lib/verify/residence-store.ts owns the rules for them),
 * and mail_postcards, one row per card asked for.
 */
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { mailCodes, mailPostcards, mailVerifications, readerAccounts, verificationProfiles } from "../../db/schema.ts";
import { tierOf, type Tier } from "../constituent/rules.ts";
import { redeemDecision, type RedeemRefusal } from "../verify/residence.ts";
import { issueMailCode, liveHolds, mailVerified, redeemMailCode, residenceOf, type Db } from "../verify/residence-store.ts";
import { addressLimit, capAllows, countsTowardLimits, monthEnd, monthStart, POSTCARD, requestDecision, type PostcardMode, type PostcardStatus, type RequestRefusal } from "./rules.ts";
import type { PostcardSender, SendResult } from "./sender.ts";

const STATUSES: readonly PostcardStatus[] = ["queued", "mock", "sent", "failed"];
const counting = (mode: PostcardMode) => STATUSES.filter(s => countsTowardLimits(s, mode));
const usd = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

/** What the account has confirmed, and where it lives. The same facts the counting rule uses (lib/constituent/store.ts). */
export async function accountStanding(db: Db, accountId: string): Promise<{ tier: Tier; addressKey: string | null; phoneHash: string | null; hasAddressOnFile: boolean; held: boolean }> {
  const [account, profile, home, mail, holds] = await Promise.all([
    db.select({ verifiedAt: readerAccounts.verifiedAt }).from(readerAccounts).where(eq(readerAccounts.id, accountId)).get(),
    db.select({ phoneHash: verificationProfiles.phoneHash, phoneVerifiedAt: verificationProfiles.phoneVerifiedAt, hasCipher: sql<number>`${verificationProfiles.addressCipher} is not null` }).from(verificationProfiles).where(eq(verificationProfiles.accountId, accountId)).get(),
    residenceOf(db, accountId), mailVerified(db, accountId), liveHolds(db, accountId)]);
  const tier = tierOf(account && profile ? { emailVerifiedAt: account.verifiedAt, phoneVerifiedAt: profile.phoneHash ? profile.phoneVerifiedAt : null, hasHome: !!home, mailVerified: mail } : null);
  return { tier, addressKey: home?.addressKey ?? null, phoneHash: profile?.phoneHash ?? null, hasAddressOnFile: Number(profile?.hasCipher ?? 0) === 1, held: holds.length > 0 };
}

/** When each card that counts was requested for this normalized address in the last 365 days, by any account. */
async function cardsAtAddress(db: Db, addressKey: string, mode: PostcardMode, now: number) {
  return db.select({ id: mailPostcards.id, accountId: mailPostcards.accountId, createdAt: mailPostcards.createdAt }).from(mailPostcards)
    .where(and(eq(mailPostcards.addressKey, addressKey), inArray(mailPostcards.status, counting(mode)), gte(mailPostcards.createdAt, now - POSTCARD.yearMs)));
}

/** Dollars spent on postcards in the calendar month `now` is in: the sum of what every card cost. */
export async function spentThisMonthUsd(db: Db, now: number): Promise<number> {
  return usd((await db.select({ total: sql<number>`coalesce(sum(${mailPostcards.costUsd}), 0)` }).from(mailPostcards).where(and(gte(mailPostcards.createdAt, monthStart(now)), lt(mailPostcards.createdAt, monthEnd(now)))).get())?.total);
}

export type RequestInput = {
  accountId: string;
  /** The code to print, and its keyed hash to store. */
  code: string; codeHash: string; now: number;
  mode: PostcardMode; capUsd: number;
  /** Null when nothing may be sent (the switch is off, or a named vendor is not ready). */
  sender: PostcardSender | null;
  /** Decrypts the home address. Called by a real sender only, at the moment of sending. */
  address: () => Promise<string | null>;
};
export type RequestResult = { ok: true; postcardId: string; status: "mock" | "sent"; requestedAt: number; expiresAt: number }
  | { ok: false; reason: RequestRefusal | "send_failed" | "try_again"; until?: number };

/**
 * A reader asks for a postcard. Every limit is checked first (lib/mail-verify/rules.ts, `requestDecision`). Then the
 * card's cost is set aside and the limits are checked once more with this card in the count, so two requests at the
 * same moment cannot both slip under the cap or the address limit. Only then is the sender called.
 */
export async function requestPostcard(db: Db, i: RequestInput): Promise<RequestResult> {
  if (!i.sender || i.mode === "off" || i.mode === "not_ready") return { ok: false, reason: i.mode === "off" ? "off" : "not_ready" };
  const who = await accountStanding(db, i.accountId);
  const before = who.addressKey ? await cardsAtAddress(db, who.addressKey, i.mode, i.now) : [];
  const mine = before.filter(c => c.accountId === i.accountId).map(c => c.createdAt);
  const decision = requestDecision({ mode: i.mode, tier: who.tier, hasAddressOnFile: who.hasAddressOnFile, held: who.held, lastRequestedAt: mine.length ? Math.max(...mine) : null,
    cardsAtAddress: before.map(c => c.createdAt), spentThisMonthUsd: await spentThisMonthUsd(db, i.now), nextCostUsd: i.sender.costUsd, capUsd: i.capUsd, now: i.now });
  if (!decision.ok) return decision;

  let issued: Awaited<ReturnType<typeof issueMailCode>>;
  try { issued = await issueMailCode(db, { accountId: i.accountId, codeHash: i.codeHash, now: i.now }); }
  catch { return { ok: false, reason: "try_again" }; } // the same code already exists (one in hundreds of millions): the caller draws another
  if (!issued) return { ok: false, reason: "no_address" };
  const id = crypto.randomUUID(), expiresAt = i.now + POSTCARD.codeTtlMs;
  const undo = async () => { await db.delete(mailPostcards).where(eq(mailPostcards.id, id)); await db.delete(mailCodes).where(eq(mailCodes.id, issued!.id)); };
  await db.insert(mailPostcards).values({ id, accountId: i.accountId, codeId: issued.id, addressKey: issued.addressKey, vendor: i.sender.vendor, status: "queued", costUsd: i.sender.costUsd, createdAt: i.now });

  // Checked again with this card counted.
  const after = (await cardsAtAddress(db, issued.addressKey, i.mode, i.now)).filter(c => c.id !== id).map(c => c.createdAt);
  const limit = addressLimit(after, i.now);
  if (!limit.ok) { await undo(); return { ok: false, reason: "address_limit", until: limit.nextAllowedAt }; }
  if (!capAllows(await spentThisMonthUsd(db, i.now), 0, i.capUsd)) { await undo(); return { ok: false, reason: "cap_reached" }; }

  const sent: SendResult = await i.sender.send({ postcardId: id, code: i.code, expiresAt, address: i.address }).catch(() => ({ ok: false as const, reason: "unreachable" as const }));
  if (!sent.ok) {
    // Nothing was mailed: the row stays as a record of the failure, costs nothing, and its code can never be used.
    await db.update(mailPostcards).set({ status: "failed", costUsd: 0 }).where(eq(mailPostcards.id, id));
    await db.delete(mailCodes).where(eq(mailCodes.id, issued.id));
    return { ok: false, reason: "send_failed" };
  }
  await db.update(mailPostcards).set({ status: sent.status, vendorRef: sent.vendorRef, costUsd: sent.costUsd, sentAt: sent.status === "sent" ? i.now : null }).where(eq(mailPostcards.id, id));
  return { ok: true, postcardId: id, status: sent.status, requestedAt: i.now, expiresAt };
}

export type RedeemResult = { ok: true; test: boolean; revoked: string[] } | { ok: false; reason: RedeemRefusal };

/**
 * The reader types the code from the postcard. A real card makes the account mail-verified (lib/verify/residence-store.ts,
 * `redeemMailCode`). A rehearsal card is checked the same way but changes nothing: no account becomes mail-verified
 * without a postcard that was really mailed.
 */
export async function redeemPostcardCode(db: Db, i: { accountId: string; codeHash: string; now: number }): Promise<RedeemResult> {
  const code = await db.select().from(mailCodes).where(eq(mailCodes.codeHash, i.codeHash)).get();
  const card = code ? await db.select({ status: mailPostcards.status }).from(mailPostcards).where(eq(mailPostcards.codeId, code.id)).get() : null;
  if (card?.status === "failed") return { ok: false, reason: "unknown" };
  if (card?.status === "mock") {
    const who = await accountStanding(db, i.accountId);
    const decision = redeemDecision(code ?? null, { id: i.accountId, addressKey: who.addressKey, phoneHash: who.phoneHash }, i.now);
    return decision.ok ? { ok: true, test: true, revoked: [] } : decision;
  }
  const r = await redeemMailCode(db, i);
  return r.ok ? { ok: true, test: false, revoked: r.revoked } : r;
}

export type AccountPostcard = { requestedAt: number; expiresAt: number; test: boolean; askAgainAt: number };
/** What the Account page shows: the account's level, and its latest card that is still waiting for its code. */
export async function postcardStateOf(db: Db, accountId: string, mode: PostcardMode, now: number): Promise<{ tier: Tier; held: boolean; hasAddressOnFile: boolean; card: AccountPostcard | null }> {
  const who = await accountStanding(db, accountId);
  const row = who.addressKey ? await db.select({ createdAt: mailPostcards.createdAt, status: mailPostcards.status, expiresAt: mailCodes.expiresAt, redeemedAt: mailCodes.redeemedAt })
    .from(mailPostcards).innerJoin(mailCodes, eq(mailCodes.id, mailPostcards.codeId))
    .where(and(eq(mailPostcards.accountId, accountId), eq(mailPostcards.addressKey, who.addressKey), inArray(mailPostcards.status, counting(mode))))
    .orderBy(desc(mailPostcards.createdAt)).limit(1).get() : null;
  const waiting = !!row && row.redeemedAt === null && row.expiresAt >= now;
  return { tier: who.tier, held: who.held, hasAddressOnFile: who.hasAddressOnFile,
    card: waiting ? { requestedAt: row!.createdAt, expiresAt: row!.expiresAt, test: row!.status === "mock", askAgainAt: row!.createdAt + POSTCARD.askAgainAfterMs } : null };
}

/** Counts only, for the editor: this month's cards by outcome, the money against the cap, and codes typed in. Never a person or an address. */
export async function postcardCounts(db: Db, now: number) {
  const from = monthStart(now), to = monthEnd(now);
  const [byStatus, redeemedMonth, verifiedNow] = await Promise.all([
    db.select({ status: mailPostcards.status, n: sql<number>`count(*)` }).from(mailPostcards).where(and(gte(mailPostcards.createdAt, from), lt(mailPostcards.createdAt, to))).groupBy(mailPostcards.status),
    db.select({ n: sql<number>`count(*)` }).from(mailCodes).where(and(gte(mailCodes.redeemedAt, from), lt(mailCodes.redeemedAt, to))).get(),
    db.select({ n: sql<number>`count(*)` }).from(mailVerifications).where(sql`${mailVerifications.revokedAt} is null`).get()]);
  const n = (s: PostcardStatus) => Number(byStatus.find(r => r.status === s)?.n ?? 0);
  const month = { queued: n("queued"), mock: n("mock"), sent: n("sent"), failed: n("failed") };
  return { month: { requested: month.queued + month.mock + month.sent + month.failed, ...month }, spentMonthUsd: await spentThisMonthUsd(db, now),
    codesRedeemedMonth: Number(redeemedMonth?.n ?? 0), mailVerifiedNow: Number(verifiedNow?.n ?? 0) };
}
