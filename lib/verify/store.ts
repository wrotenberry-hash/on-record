import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db";
import { billFollows, readerLocations, countedPositions, digestSends, flaggedPositions, integrityCounts, integrityFlags, magicLinks, opinionUserVotes, rateEvents, readerAccounts,
  sentimentTotals, userFollows, verificationProfiles } from "@/db/schema";
import { keyedHash } from "@/lib/verify/crypto";
import { verificationConfig } from "@/lib/verify/config";
import { COST_USD, LIMITS, monthKey, positionCounts, tierFor, ipRange, type LimitName, type Tier } from "@/lib/verify/rules";

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

export async function bumpCount(kind: "account_blocked" | "position_quarantined" | "spend", reason: string, n = 1, now = Date.now()) {
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

/** Recomputes one bill's totals from its counted, unquarantined positions of accounts at least 24 h old. */
export async function recomputeBill(billId: string, now = Date.now()) {
  const db = getDb();
  const rows = await db.select({ stance: countedPositions.stance, tier: countedPositions.tier, districtId: verificationProfiles.districtId, state: verificationProfiles.stateCode,
    accountCreatedAt: readerAccounts.createdAt,
    quarantined: sql<number>`exists (select 1 from flagged_positions fp join integrity_flags f on f.id = fp.flag_id where fp.user_id = ${countedPositions.userId} and fp.bill_id = ${countedPositions.billId} and f.status in ('open', 'confirmed'))` })
    .from(countedPositions).innerJoin(readerAccounts, eq(readerAccounts.id, countedPositions.accountId))
    .innerJoin(verificationProfiles, eq(verificationProfiles.accountId, countedPositions.accountId)).where(eq(countedPositions.billId, billId));
  const totals = new Map<string, { support: number; oppose: number }>();
  const add = (scope: string, group: "real" | "district", stance: string) => {
    const t = totals.get(`${scope}|${group}`) ?? { support: 0, oppose: 0 };
    if (stance === "support") t.support++; else t.oppose++;
    totals.set(`${scope}|${group}`, t);
  };
  for (const r of rows) {
    if (!positionCounts({ tier: r.tier, accountCreatedAt: r.accountCreatedAt, quarantined: Number(r.quarantined) === 1, now })) continue;
    add("US", "real", r.stance);
    if (r.tier >= 2 && r.districtId && r.state) { add("US", "district", r.stance); add(r.state, "district", r.stance); add(r.districtId, "district", r.stance); }
  }
  await db.delete(sentimentTotals).where(eq(sentimentTotals.billId, billId));
  const values = [...totals].map(([k, t]) => { const [scope, tierGroup] = k.split("|"); return { billId, scope, tierGroup: tierGroup as "real" | "district", ...t, updatedAt: now }; });
  if (values.length) await db.insert(sentimentTotals).values(values);
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
  await db.delete(verificationProfiles).where(eq(verificationProfiles.accountId, account.id));
  await db.delete(digestSends).where(eq(digestSends.accountId, account.id));
  await db.delete(magicLinks).where(eq(magicLinks.emailHash, account.emailHash));
  await db.delete(readerAccounts).where(eq(readerAccounts.id, account.id));
  for (const b of bills) await recomputeBill(b.billId);
}

/** Housekeeping each scheduled run: drop rate rows after 48 h and sign-up network/device hashes after 30 days. */
export async function purgeVerificationData(now = Date.now()) {
  const db = getDb();
  await db.delete(rateEvents).where(lt(rateEvents.at, now - 48 * 3600e3));
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
    flags: { open: f("open"), confirmed: f("confirmed"), cleared: f("cleared") }, quarantinedPositions: Number(quarantined?.n ?? 0) };
}
