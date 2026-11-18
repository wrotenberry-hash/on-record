import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db";
import { billFollows, readerLocations, countedPositions, digestSends, flaggedPositions, integrityCounts, integrityFlags, magicLinks, opinionUserVotes, rateEvents, readerAccounts,
  sentimentTotals, userFollows, verificationProfiles } from "@/db/schema";
import { keyedHash } from "@/lib/verify/crypto";
import { verificationConfig } from "@/lib/verify/config";
import { COST_USD, LIMITS, monthKey, tierFor, ipRange, type LimitName, type Tier } from "@/lib/verify/rules";
import { holdCounts, holdPhone, purgePhoneHolds, recomputeBillTotals } from "@/lib/verify/residence-store";

export type Account = typeof readerAccounts.$inferSelect;
export type Profile = typeof verificationProfiles.$inferSelect;
export const DEVICE_COOKIE = "or_dev";

/** The request's network range and device, as keyed hashes. The raw IP is used only for the bot check and never stored. */
export async function requestContext() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
  const range = ipRange(ip);
  const dev = (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
  return { ip, ipRange: range ? await keyedHash("ip", range) : null, device: dev ? await keyedHash("device", dev) : null };
}

/** Server actions only: gives this browser a random first-party device id if it has none. */
export async function ensureDeviceCookie() {
  const jar = await cookies();
  if (!jar.get(DEVICE_COOKIE)) jar.set(DEVICE_COOKIE, crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 24 * 3600 });
}

/** Sliding-window limit. Records the attempt when allowed. No scope value is stored, only its keyed hash. */
export async function withinLimit(name: LimitName, scopeValue: string | null, now = Date.now()) {
  if (!scopeValue) return true;
  const { max, windowMs } = LIMITS[name], db = getDb(), key = await keyedHash("rate", `${name}:${scopeValue}`);
  const n = Number((await db.select({ n: sql<number>`count(*)` }).from(rateEvents).where(and(eq(rateEvents.key, key), eq(rateEvents.action, name), gte(rateEvents.at, now - windowMs))).get())?.n ?? 0);
  if (n >= max) return false;
  await db.insert(rateEvents).values({ id: crypto.randomUUID(), key, action: name, at: now });
  return true;
}

export async function bumpCount(kind: "account_blocked" | "position_quarantined" | "account_held" | "spend", reason: string, n = 1, now = Date.now()) {
  if (n <= 0) return;
  await getDb().insert(integrityCounts).values({ month: monthKey(now), kind, reason, n })
    .onConflictDoUpdate({ target: [integrityCounts.month, integrityCounts.kind, integrityCounts.reason], set: { n: sql`${integrityCounts.n} + ${n}` } });
}

/** Month-to-date verification spend from the counters, priced at Twilio list prices. */
export async function verifySpendUsd(now = Date.now()) {
  const rows = await getDb().select().from(integrityCounts).where(and(eq(integrityCounts.month, monthKey(now)), eq(integrityCounts.kind, "spend")));
  return Math.round(rows.reduce((s, r) => s + r.n * (COST_USD[r.reason as keyof typeof COST_USD] ?? 0), 0) * 1000) / 1000;
}
export async function spendAllowed(next: keyof typeof COST_USD) {
  return (await verifySpendUsd()) + COST_USD[next] <= verificationConfig().monthlyCapUsd;
}

export async function profileFor(accountId: string) {
  return (await getDb().select().from(verificationProfiles).where(eq(verificationProfiles.accountId, accountId)).get()) ?? null;
}

export async function ensureProfile(accountId: string, init: Partial<Profile> = {}) {
  const now = Date.now();
  await getDb().insert(verificationProfiles).values({ accountId, tier: 0, createdAt: now, updatedAt: now, ...init }).onConflictDoNothing();
  return (await profileFor(accountId))!;
}

export async function updateProfile(accountId: string, set: Partial<Profile>) {
  await getDb().update(verificationProfiles).set({ ...set, updatedAt: Date.now() }).where(eq(verificationProfiles.accountId, accountId));
}

/** Recomputes the account's tier; when it changes, re-stamps its positions and recomputes those bills' totals. */
export async function refreshTier(account: Account): Promise<Tier> {
  const p = await profileFor(account.id);
  const tier = tierFor(p ? { emailVerifiedAt: account.verifiedAt, ...p } : null);
  if (p && p.tier !== tier) {
    await updateProfile(account.id, { tier });
    await getDb().update(countedPositions).set({ tier }).where(eq(countedPositions.accountId, account.id));
    await recomputeAccountBills(account.id);
  }
  return tier;
}

async function recomputeAccountBills(accountId: string) {
  const bills = await getDb().selectDistinct({ billId: countedPositions.billId }).from(countedPositions).where(eq(countedPositions.accountId, accountId));
  for (const b of bills) await recomputeBill(b.billId);
}

/**
 * Recomputes one bill's totals from its counted, unquarantined positions of accounts at least 24 h old. Each answer
 * counts in the districts it was stamped with when it first had a home, and not at all while its account is set aside
 * for review (lib/verify/residence-store.ts).
 */
export async function recomputeBill(billId: string, now = Date.now()) {
  await recomputeBillTotals(getDb(), billId, now);
}

/** Every bill with counted positions (each scheduled run: accounts cross the 24-hour line over time). */
export async function recomputeAll(now = Date.now()) {
  const bills = await getDb().selectDistinct({ billId: countedPositions.billId }).from(countedPositions);
  for (const b of bills) await recomputeBill(b.billId, now);
  return bills.length;
}

export async function totalsFor(billId: string) {
  const rows = await getDb().select().from(sentimentTotals).where(eq(sentimentTotals.billId, billId));
  const get = (scope: string, group: "real" | "district") => rows.find(r => r.scope === scope && r.tierGroup === group) ?? null;
  return { real: get("US", "real"), district: get("US", "district"), scope: (s: string) => get(s, "district") };
}

/** District-matched totals in one scope (a district or a state) for many bills. */
export async function scopeTotals(scope: string, billIds: string[]) {
  if (!billIds.length) return [];
  return getDb().select().from(sentimentTotals).where(and(eq(sentimentTotals.scope, scope), inArray(sentimentTotals.billId, billIds)));
}

/** Writes or clears the counted copy of a reader's answer. */
export async function writeCounted(input: { userId: string; account: Account; tier: Tier; billId: string; stance: "support" | "oppose" | null;
  reason: string | null; reasonHash: string | null; ctx: { ipRange: string | null; device: string | null } }) {
  const db = getDb(), now = Date.now();
  if (!input.stance) await db.delete(countedPositions).where(and(eq(countedPositions.userId, input.userId), eq(countedPositions.billId, input.billId)));
  else await db.insert(countedPositions).values({ userId: input.userId, billId: input.billId, accountId: input.account.id, stance: input.stance, tier: input.tier,
    reason: input.reason, reasonHash: input.reasonHash, device: input.ctx.device, ipRange: input.ctx.ipRange, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [countedPositions.userId, countedPositions.billId], set: { stance: input.stance, tier: input.tier, reason: input.reason, reasonHash: input.reasonHash, updatedAt: now } });
}

/** After the first-vote challenge: the reader's earlier private answers join the counted set. */
export async function backfillCounted(userId: string, account: Account, tier: Tier, ctx: { ipRange: string | null; device: string | null }) {
  const answers = await getDb().select().from(opinionUserVotes).where(eq(opinionUserVotes.userId, userId));
  for (const a of answers) await writeCounted({ userId, account, tier, billId: a.billId, stance: a.stance as "support" | "oppose", reason: null, reasonHash: null, ctx });
  return answers.map(a => a.billId);
}

/** Deletes the account, its answers (counted and private), follows and verification record. Recomputes the bills it touched. */
export async function deleteAccountAndPositions(account: Account) {
  const db = getDb();
  const bills = await db.selectDistinct({ billId: countedPositions.billId }).from(countedPositions).where(eq(countedPositions.accountId, account.id));
  await db.delete(flaggedPositions).where(eq(flaggedPositions.userId, account.appUserId));
  await db.delete(countedPositions).where(eq(countedPositions.userId, account.appUserId));
  await db.delete(opinionUserVotes).where(eq(opinionUserVotes.userId, account.appUserId));
  await db.delete(userFollows).where(eq(userFollows.userId, account.appUserId));
  await db.delete(billFollows).where(eq(billFollows.userId, account.appUserId));
  await db.delete(readerLocations).where(eq(readerLocations.userId, account.appUserId));
  const { positionHistory, readerUnsure, readerIssues, readerVisits, alertPrefs, pushSubscriptions, alertOutbox, reminders } = await import("@/db/schema");
  await db.delete(positionHistory).where(eq(positionHistory.userId, account.appUserId));
  await db.delete(readerUnsure).where(eq(readerUnsure.userId, account.appUserId));
  await db.delete(readerIssues).where(eq(readerIssues.userId, account.appUserId));
  await db.delete(readerVisits).where(eq(readerVisits.userId, account.appUserId));
  await db.delete(alertPrefs).where(eq(alertPrefs.userId, account.appUserId));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, account.appUserId));
  await db.delete(alertOutbox).where(eq(alertOutbox.userId, account.appUserId));
  await db.delete(reminders).where(eq(reminders.userId, account.appUserId));
  // One person, one residence: the phone's keyed hash is kept out for 90 days so the number cannot open a new account
  // straight away (it holds no account id); everything else these tables hold about the account goes.
  const { accountHolds, accountResidences, mailCodes, mailVerifications, positionResidences, residenceChanges } = await import("@/db/schema");
  const phoneHash = (await db.select({ phoneHash: verificationProfiles.phoneHash }).from(verificationProfiles).where(eq(verificationProfiles.accountId, account.id)).get())?.phoneHash ?? null;
  if (phoneHash) await holdPhone(db, phoneHash, Date.now());
  await db.delete(positionResidences).where(eq(positionResidences.accountId, account.id));
  await db.delete(mailVerifications).where(eq(mailVerifications.accountId, account.id));
  await db.delete(mailCodes).where(eq(mailCodes.accountId, account.id));
  await db.delete(accountHolds).where(eq(accountHolds.accountId, account.id));
  await db.delete(residenceChanges).where(eq(residenceChanges.accountId, account.id));
  await db.delete(accountResidences).where(eq(accountResidences.accountId, account.id));
  await db.delete(verificationProfiles).where(eq(verificationProfiles.accountId, account.id));
  await db.delete(digestSends).where(eq(digestSends.accountId, account.id));
  // A briefing subscription points at the account: with it left in place the database refused to delete the account row,
  // so the email stayed behind (found while writing the privacy draft; tests/trust.test.mjs). The bot-check record of each sign-in link goes too.
  const { briefingSubscriptions, linkChallenges } = await import("@/db/schema");
  await db.delete(briefingSubscriptions).where(eq(briefingSubscriptions.accountId, account.id));
  const links = await db.select({ nonce: magicLinks.nonce }).from(magicLinks).where(eq(magicLinks.emailHash, account.emailHash));
  if (links.length) await db.delete(linkChallenges).where(inArray(linkChallenges.nonce, links.map(l => l.nonce)));
  await db.delete(magicLinks).where(eq(magicLinks.emailHash, account.emailHash));
  await db.delete(readerAccounts).where(eq(readerAccounts.id, account.id));
  for (const b of bills) await recomputeBill(b.billId);
}

/** Housekeeping each scheduled run: drop rate rows after 48 h and sign-up network/device hashes after 30 days. */
export async function purgeVerificationData(now = Date.now()) {
  const db = getDb();
  await db.delete(rateEvents).where(lt(rateEvents.at, now - 48 * 3600e3));
  await purgePhoneHolds(db, now); // a deleted account's phone hash is dropped when its 90 days are up
  const { residenceChanges } = await import("@/db/schema");
  await db.update(residenceChanges).set({ device: null, ipRange: null }).where(and(lt(residenceChanges.at, now - 30 * 86400e3), sql`(${residenceChanges.device} is not null or ${residenceChanges.ipRange} is not null)`));
  await db.update(verificationProfiles).set({ signupIpRange: null, signupDevice: null }).where(and(lt(verificationProfiles.createdAt, now - 30 * 86400e3), sql`(${verificationProfiles.signupIpRange} is not null or ${verificationProfiles.signupDevice} is not null)`));
}

/** Counts only, for the health probe and editor. */
export async function verificationCounts() {
  const db = getDb(), c = verificationConfig();
  const [tiers, flags, quarantined, positions] = await Promise.all([
    db.select({ tier: verificationProfiles.tier, n: sql<number>`count(*)` }).from(verificationProfiles).groupBy(verificationProfiles.tier),
    db.select({ status: integrityFlags.status, n: sql<number>`count(*)` }).from(integrityFlags).groupBy(integrityFlags.status),
    db.select({ n: sql<number>`count(distinct ${flaggedPositions.userId} || ':' || ${flaggedPositions.billId})` }).from(flaggedPositions).innerJoin(integrityFlags, eq(integrityFlags.id, flaggedPositions.flagId)).where(inArray(integrityFlags.status, ["open", "confirmed"])).get(),
    db.select({ n: sql<number>`count(*)` }).from(countedPositions).get(),
  ]);
  const t = (k: number) => Number(tiers.find(r => r.tier === k)?.n ?? 0), f = (k: string) => Number(flags.find(r => r.status === k)?.n ?? 0);
  return { enabled: c.enabled, turnstileConfigured: c.turnstileReady, twilioConfigured: c.twilioReady, monthlyCapUsd: c.monthlyCapUsd, spendMonthUsd: await verifySpendUsd(),
    profiles: { tier0: t(0), tier1: t(1), tier2: t(2) }, countedPositions: Number(positions?.n ?? 0),
    flags: { open: f("open"), confirmed: f("confirmed"), cleared: f("cleared") }, quarantinedPositions: Number(quarantined?.n ?? 0),
    accountsSetAside: await holdCounts(db).catch(() => null), addressAuthorityConfigured: c.addressAuthorityReady };
}
