/**
 * One person, one residence: the database side of lib/verify/residence.ts. Every function takes the database handle,
 * and nothing here reads a request or a secret, so tests/residence.test.mjs runs these same functions against a real
 * (temporary) database built from the migrations. Hashing of phones, addresses, devices and codes is done by the
 * caller (lib/verify/flow.ts); only keyed hashes arrive here.
 */
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { accountHolds, accountResidences, mailCodes, mailVerifications, phoneHolds, positionResidences, readerAccounts, residenceChanges, verificationProfiles, voiceVotes } from "../../db/schema.ts";
import { addressChangesSignal, canSetAddress, districtClusterSignal, householdDecision, mailRevocations, manyAddressesSignal, phoneHoldUntil, redeemDecision,
  RESIDENCE, type Districts, type HoldKind, type RedeemRefusal } from "./residence.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the app passes its typed handle, the tests a plain one
export type Db = LibSQLDatabase<any>;
const LIVE_HOLD = ["open", "confirmed"] as const;

export async function residenceOf(db: Db, accountId: string) {
  return (await db.select().from(accountResidences).where(eq(accountResidences.accountId, accountId)).get()) ?? null;
}

/** Is any hold on this account open or confirmed? Such an account reads and follows, and is not counted. */
export async function liveHolds(db: Db, accountId: string) {
  return db.select().from(accountHolds).where(and(eq(accountHolds.accountId, accountId), inArray(accountHolds.status, [...LIVE_HOLD])));
}

/** Sets an account aside. Returns true when the hold is new; a hold the editor already decided is not raised again. */
export async function openHold(db: Db, accountId: string, kind: HoldKind, subject: string, detail: Record<string, unknown>, now: number): Promise<boolean> {
  const r = await db.insert(accountHolds).values({ id: crypto.randomUUID(), accountId, kind, subject, status: "open", detail, createdAt: now }).onConflictDoNothing().returning({ id: accountHolds.id });
  return r.length > 0;
}

/** How many other accounts already count at this normalized address (those set aside for the household cap do not). */
export async function countedAtAddress(db: Db, addressKey: string, exceptAccountId: string): Promise<number> {
  const row = await db.select({ n: sql<number>`count(*)` }).from(accountResidences).where(and(eq(accountResidences.addressKey, addressKey), ne(accountResidences.accountId, exceptAccountId),
    sql`not exists (select 1 from account_holds h where h.account_id = ${accountResidences.accountId} and h.kind = 'household_cap' and h.status in ('open', 'confirmed'))`)).get();
  return Number(row?.n ?? 0);
}

/** Gives every answer of the account that has no home yet the account's current one. Existing stamps are left alone. */
export async function stampUnstamped(db: Db, accountId: string, now: number): Promise<number> {
  const home = await residenceOf(db, accountId);
  if (!home) return 0;
  const open = await db.select({ userId: voiceVotes.userId, billId: voiceVotes.billKey }).from(voiceVotes).where(and(eq(voiceVotes.accountId, accountId),
    sql`not exists (select 1 from position_residences p where p.user_id = ${voiceVotes.userId} and p.bill_id = ${voiceVotes.billKey})`));
  for (const p of open) await db.insert(positionResidences).values({ userId: p.userId, billId: p.billId, accountId, congressional: home.congressional, stateCode: home.stateCode,
    stateUpper: home.stateUpper, stateLower: home.stateLower, stampedAt: now }).onConflictDoNothing();
  return open.length;
}

/** After an answer is counted: it takes the account's home if it has none. Never changes a stamp that exists. */
export async function stampPosition(db: Db, p: { userId: string; billId: string; accountId: string }, now: number) {
  const home = await residenceOf(db, p.accountId);
  if (!home) return false;
  const r = await db.insert(positionResidences).values({ ...p, congressional: home.congressional, stateCode: home.stateCode, stateUpper: home.stateUpper, stateLower: home.stateLower, stampedAt: now })
    .onConflictDoNothing().returning({ userId: positionResidences.userId });
  return r.length > 0;
}

export type SetResidenceInput = { accountId: string; addressKey: string; buildingKey: string; hasUnit: boolean; districts: Districts; device: string | null; ipRange: string | null;
  /** Is a vote expected within a week for this address's federal and state districts? */
  voteSoon: { federal: boolean; state: boolean }; now: number };
export type SetResidenceResult = { ok: true; kind: "first" | "same" | "change"; held: HoldKind[]; heldAccounts: string[] } | { ok: false; reason: "too_soon"; nextAllowedAt: number; held: HoldKind[] };

/**
 * The account's one home. A first address is saved; the same address again changes nothing; a different one replaces
 * the old one if 90 days have passed, and is refused (and logged) if not. Then the household cap and the review signals.
 */
export async function setResidence(db: Db, i: SetResidenceInput): Promise<SetResidenceResult> {
  const current = await residenceOf(db, i.accountId), decision = canSetAddress(current, i.addressKey, i.now), held: HoldKind[] = [];
  const log = (kind: "first" | "change" | "refused") => db.insert(residenceChanges).values({ id: crypto.randomUUID(), accountId: i.accountId, kind, at: i.now,
    fromAddressKey: current?.addressKey ?? null, toAddressKey: i.addressKey, fromCongressional: current?.congressional ?? null, toCongressional: i.districts.congressional, device: i.device, ipRange: i.ipRange });
  if (!decision.ok) {
    await log("refused");
    if (await repeatedChanges(db, i.accountId, i.now)) held.push("address_changes");
    return { ...decision, held };
  }
  if (decision.kind === "same") return { ok: true, kind: "same", held, heldAccounts: [] };
  const row = { addressKey: i.addressKey, buildingKey: i.buildingKey, hasUnit: i.hasUnit ? 1 : 0, congressional: i.districts.congressional, stateCode: i.districts.state,
    stateUpper: i.districts.stateUpper, stateLower: i.districts.stateLower, setAt: i.now };
  // The primary key is the account: the new address takes the old one's place, so there is never a second.
  await db.insert(accountResidences).values({ accountId: i.accountId, ...row }).onConflictDoUpdate({ target: accountResidences.accountId, set: row });
  await log(decision.kind);
  // A code mailed to the old address proves nothing about the new one.
  if (decision.kind === "change") await db.update(mailVerifications).set({ revokedAt: i.now, revokedReason: "moved" }).where(and(eq(mailVerifications.accountId, i.accountId), sql`${mailVerifications.revokedAt} is null`, ne(mailVerifications.addressKey, i.addressKey)));
  await stampUnstamped(db, i.accountId, i.now);

  const heldAccounts = new Set<string>();
  const hold = async (accountId: string, kind: HoldKind, subject: string, detail: Record<string, unknown>) => {
    if (await openHold(db, accountId, kind, subject, detail, i.now)) heldAccounts.add(accountId);
    if (accountId === i.accountId && !held.includes(kind) && (await liveHolds(db, accountId)).some(h => h.kind === kind)) held.push(kind);
  };
  // 3. Household cap.
  const others = await countedAtAddress(db, i.addressKey, i.accountId);
  if (householdDecision(others) === "over_cap") await hold(i.accountId, "household_cap", i.addressKey, { countedAtAddress: others, cap: RESIDENCE.householdCap });
  // 5a. One device or network setting up accounts at many addresses.
  for (const [kind, value, col, windowMs] of [["device", i.device, residenceChanges.device, RESIDENCE.deviceWindowMs], ["network", i.ipRange, residenceChanges.ipRange, RESIDENCE.networkWindowMs]] as const) {
    if (!value) continue;
    const rows = await db.select({ accountId: residenceChanges.accountId, addressKey: residenceChanges.toAddressKey }).from(residenceChanges)
      .where(and(eq(col, value), inArray(residenceChanges.kind, ["first", "change"]), gte(residenceChanges.at, i.now - windowMs)));
    const addresses = new Set(rows.map(r => r.addressKey)), accounts = [...new Set(rows.map(r => r.accountId))];
    if (accounts.length > 1 && manyAddressesSignal(kind, addresses.size))
      for (const a of accounts) await hold(a, kind === "device" ? "device_addresses" : "network_addresses", value, { addresses: addresses.size, accounts: accounts.length });
  }
  // 5c. Repeated address changes.
  if (decision.kind === "change" && await repeatedChanges(db, i.accountId, i.now)) held.push("address_changes");
  // 5b. A burst of new accounts, or of address changes from another district, into one district right before a vote.
  for (const [district, col, soon] of [[i.districts.congressional, accountResidences.congressional, i.voteSoon.federal], [i.districts.stateUpper, accountResidences.stateUpper, i.voteSoon.state],
    [i.districts.stateLower, accountResidences.stateLower, i.voteSoon.state]] as const) {
    if (!district || !soon) continue;
    const c = RESIDENCE.cluster, from = i.now - c.windowMs;
    const arrivals = (since: number, until: number) => db.select({ accountId: accountResidences.accountId }).from(accountResidences).innerJoin(readerAccounts, eq(readerAccounts.id, accountResidences.accountId))
      .where(and(eq(col, district), gte(accountResidences.setAt, since), lt(accountResidences.setAt, until), sql`(${accountResidences.setAt} - ${readerAccounts.createdAt} < ${c.youngMs} or exists (select 1 from residence_changes rc where rc.account_id = ${accountResidences.accountId} and rc.kind = 'change' and rc.at = ${accountResidences.setAt} and rc.from_congressional is not rc.to_congressional))`));
    const [recent, before] = await Promise.all([arrivals(from, i.now + 1), arrivals(from - c.baselineMs, from)]);
    if (!districtClusterSignal({ recent: recent.length, baseline: before.length, voteSoon: soon })) continue;
    const subject = `${district}@${new Date(i.now).toISOString().slice(0, 10)}`;
    for (const a of recent) await hold(a.accountId, "district_cluster", subject, { district, arrivals72h: recent.length, previous28d: before.length });
  }
  return { ok: true, kind: decision.kind, held, heldAccounts: [...heldAccounts] };
}

/** The third change in a year, or three refused tries in 30 days: the account is set aside for review. */
async function repeatedChanges(db: Db, accountId: string, now: number): Promise<boolean> {
  const rows = await db.select({ kind: residenceChanges.kind, at: residenceChanges.at }).from(residenceChanges).where(and(eq(residenceChanges.accountId, accountId), gte(residenceChanges.at, now - RESIDENCE.changesWindowMs)));
  const changesInYear = rows.filter(r => r.kind === "change").length, refusedInMonth = rows.filter(r => r.kind === "refused" && r.at >= now - RESIDENCE.refusedWindowMs).length;
  if (!addressChangesSignal({ changesInYear, refusedInMonth })) return false;
  // One hold per year of changes, so clearing it is not undone by the same history.
  await openHold(db, accountId, "address_changes", `${accountId}@${new Date(now).getUTCFullYear()}`, { changesInYear, refusedInMonth }, now);
  return (await liveHolds(db, accountId)).some(h => h.kind === "address_changes");
}

/** The bills an account has answers on (to rebuild totals after a hold, a decision or a new address). */
export async function billsOfAccounts(db: Db, accountIds: readonly string[]): Promise<string[]> {
  if (!accountIds.length) return [];
  return (await db.selectDistinct({ billKey: voiceVotes.billKey }).from(voiceVotes).where(inArray(voiceVotes.accountId, [...accountIds]))).map(r => r.billKey);
}

/** Editor decision on a hold: "clear" counts the account again; "confirm" keeps it out. Nothing is deleted. */
export async function decideHold(db: Db, holdId: string, decision: "clear" | "confirm", now: number): Promise<string | null> {
  const h = await db.select().from(accountHolds).where(eq(accountHolds.id, holdId)).get();
  if (!h) return null;
  await db.update(accountHolds).set({ status: decision === "clear" ? "cleared" : "confirmed", decidedAt: now }).where(eq(accountHolds.id, holdId));
  return h.accountId;
}

export async function holdsForEditor(db: Db, limit = 100) {
  return db.select().from(accountHolds).orderBy(sql`case ${accountHolds.status} when 'open' then 0 else 1 end`, sql`${accountHolds.createdAt} desc`).limit(limit);
}
export async function holdCounts(db: Db) {
  const rows = await db.select({ status: accountHolds.status, n: sql<number>`count(distinct ${accountHolds.accountId})` }).from(accountHolds).groupBy(accountHolds.status);
  const n = (s: string) => Number(rows.find(r => r.status === s)?.n ?? 0);
  return { open: n("open"), confirmed: n("confirmed"), cleared: n("cleared") };
}

/* ───────────────────────────── Phone holds ───────────────────────────── */

/** Until when a deleted account's phone is kept out, or null. */
export async function phoneHeldUntil(db: Db, phoneHash: string, now: number): Promise<number | null> {
  const row = await db.select().from(phoneHolds).where(eq(phoneHolds.phoneHash, phoneHash)).get();
  return row && row.until > now ? row.until : null;
}
export async function holdPhone(db: Db, phoneHash: string, now: number) {
  const until = phoneHoldUntil(now);
  await db.insert(phoneHolds).values({ phoneHash, releasedAt: now, until }).onConflictDoUpdate({ target: phoneHolds.phoneHash, set: { releasedAt: now, until } });
  return until;
}
export async function purgePhoneHolds(db: Db, now: number) { await db.delete(phoneHolds).where(lt(phoneHolds.until, now)); }

/* ───────────────────────────── Mailed codes ───────────────────────────── */

/** Records a code about to be mailed to the account's current address. Returns null when the account has no address. */
export async function issueMailCode(db: Db, i: { accountId: string; codeHash: string; now: number }) {
  const home = await residenceOf(db, i.accountId);
  if (!home) return null;
  const id = crypto.randomUUID();
  await db.insert(mailCodes).values({ id, codeHash: i.codeHash, accountId: i.accountId, addressKey: home.addressKey, issuedAt: i.now, expiresAt: i.now + RESIDENCE.mailCodeTtlMs });
  return { id, addressKey: home.addressKey };
}

/**
 * Redeems a mailed code. It works once, for the account it was sent for, at the address it was mailed to. The account
 * becomes mail-verified there, and any other account mail-verified at a different address with the same phone hash loses that status.
 */
export async function redeemMailCode(db: Db, i: { accountId: string; codeHash: string; now: number }): Promise<{ ok: true; revoked: string[] } | { ok: false; reason: RedeemRefusal }> {
  const [code, home, profile] = await Promise.all([db.select().from(mailCodes).where(eq(mailCodes.codeHash, i.codeHash)).get(), residenceOf(db, i.accountId),
    db.select({ phoneHash: verificationProfiles.phoneHash }).from(verificationProfiles).where(eq(verificationProfiles.accountId, i.accountId)).get()]);
  const decision = redeemDecision(code ?? null, { id: i.accountId, addressKey: home?.addressKey ?? null, phoneHash: profile?.phoneHash ?? null }, i.now);
  if (!decision.ok) return decision;
  // Claimed only if still unclaimed: two requests at once cannot both win.
  const claimed = await db.update(mailCodes).set({ redeemedAt: i.now, redeemedBy: i.accountId }).where(and(eq(mailCodes.id, code!.id), sql`${mailCodes.redeemedAt} is null`)).returning({ id: mailCodes.id });
  if (!claimed.length) return { ok: false, reason: "used" };
  const mine = { accountId: i.accountId, addressKey: code!.addressKey, phoneHash: profile!.phoneHash! };
  const revoke = mailRevocations(await db.select().from(mailVerifications).where(eq(mailVerifications.phoneHash, mine.phoneHash)), mine);
  if (revoke.length) await db.update(mailVerifications).set({ revokedAt: i.now, revokedReason: "phone_verified_elsewhere" }).where(inArray(mailVerifications.accountId, revoke));
  const row = { addressKey: mine.addressKey, phoneHash: mine.phoneHash, codeId: code!.id, verifiedAt: i.now, revokedAt: null, revokedReason: null };
  await db.insert(mailVerifications).values({ accountId: i.accountId, ...row }).onConflictDoUpdate({ target: mailVerifications.accountId, set: row });
  return { ok: true, revoked: revoke };
}

export async function mailVerified(db: Db, accountId: string): Promise<boolean> {
  const [v, home] = await Promise.all([db.select().from(mailVerifications).where(eq(mailVerifications.accountId, accountId)).get(), residenceOf(db, accountId)]);
  return !!v && v.revokedAt === null && !!home && home.addressKey === v.addressKey;
}
