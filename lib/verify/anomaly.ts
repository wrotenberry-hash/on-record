import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { countedPositions, flaggedPositions, integrityFlags, readerAccounts, verificationProfiles } from "@/db/schema";
import { ANOMALY, isSurge } from "@/lib/verify/rules";
import { bumpCount, recomputeBill } from "@/lib/verify/store";

/**
 * Round J anomaly checks. A flag quarantines positions (they leave the totals)
 * but never deletes them; the editor clears a flag (positions count again) or
 * confirms it (they stay out). Checks run on every counted write for the bill,
 * district, network and device involved, and at sign-up for clusters.
 */
type Kind = typeof integrityFlags.$inferSelect["kind"];
type Pos = { userId: string; billId: string };

/** The open flag for this kind and subject from the last 24 h, or a new one. */
async function flagFor(kind: Kind, subject: string, detail: Record<string, unknown>, now: number) {
  const db = getDb();
  const open = await db.select().from(integrityFlags).where(and(eq(integrityFlags.kind, kind), eq(integrityFlags.subject, subject), inArray(integrityFlags.status, ["open", "confirmed"]), gte(integrityFlags.createdAt, now - 86400e3))).get();
  if (open) { await db.update(integrityFlags).set({ detail }).where(eq(integrityFlags.id, open.id)); return open.id; }
  const id = crypto.randomUUID();
  await db.insert(integrityFlags).values({ id, kind, subject, detail, status: "open", createdAt: now });
  return id;
}

/**
 * Adds positions to a flag; counts only the newly quarantined ones. A position
 * the editor already cleared under the same kind and subject is not flagged
 * again by the same continuing pattern.
 */
async function quarantine(flagId: string, kind: Kind, positions: Pos[]) {
  if (!positions.length) return 0;
  const db = getDb();
  const flag = await db.select({ subject: integrityFlags.subject }).from(integrityFlags).where(eq(integrityFlags.id, flagId)).get();
  const before = await db.select({ userId: flaggedPositions.userId, billId: flaggedPositions.billId }).from(flaggedPositions).where(eq(flaggedPositions.flagId, flagId));
  const cleared = flag ? await db.select({ userId: flaggedPositions.userId, billId: flaggedPositions.billId }).from(flaggedPositions)
    .innerJoin(integrityFlags, eq(integrityFlags.id, flaggedPositions.flagId))
    .where(and(eq(integrityFlags.kind, kind), eq(integrityFlags.subject, flag.subject), eq(integrityFlags.status, "cleared"))) : [];
  const seen = new Set([...before, ...cleared].map(p => `${p.userId}|${p.billId}`));
  const fresh = positions.filter(p => !seen.has(`${p.userId}|${p.billId}`));
  if (fresh.length) await db.insert(flaggedPositions).values(fresh.map(p => ({ flagId, ...p }))).onConflictDoNothing();
  await bumpCount("position_quarantined", kind, fresh.length);
  return fresh.length;
}

const young = (now: number) => sql`${readerAccounts.createdAt} > ${now - ANOMALY.youngAccountMs}`;

async function billSurge(billId: string, now: number) {
  const db = getDb(), from = now - ANOMALY.surgeWindowMs;
  const [last, base] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(countedPositions).where(and(eq(countedPositions.billId, billId), gte(countedPositions.createdAt, from))).get(),
    db.select({ n: sql<number>`count(*)` }).from(countedPositions).where(and(eq(countedPositions.billId, billId), gte(countedPositions.createdAt, from - ANOMALY.baselineMs), lt(countedPositions.createdAt, from))).get(),
  ]);
  const lastHour = Number(last?.n ?? 0), baseline = Number(base?.n ?? 0);
  if (!isSurge(lastHour, baseline, ANOMALY.surgeFloor)) return 0;
  const flag = await flagFor("bill_surge", billId, { lastHour, baseline7d: baseline }, now);
  const pos = await db.select({ userId: countedPositions.userId, billId: countedPositions.billId }).from(countedPositions)
    .innerJoin(readerAccounts, eq(readerAccounts.id, countedPositions.accountId)).where(and(eq(countedPositions.billId, billId), gte(countedPositions.createdAt, from), young(now)));
  return quarantine(flag, "bill_surge", pos);
}

async function districtSurge(billId: string, districtId: string, now: number) {
  const db = getDb(), from = now - ANOMALY.surgeWindowMs;
  const scoped = (since: number, until?: number) => db.select({ n: sql<number>`count(*)` }).from(countedPositions)
    .innerJoin(verificationProfiles, eq(verificationProfiles.accountId, countedPositions.accountId))
    .where(and(eq(countedPositions.billId, billId), eq(verificationProfiles.districtId, districtId), gte(countedPositions.createdAt, since), ...(until ? [lt(countedPositions.createdAt, until)] : []))).get();
  const [last, base] = await Promise.all([scoped(from), scoped(from - ANOMALY.baselineMs, from)]);
  const lastHour = Number(last?.n ?? 0), baseline = Number(base?.n ?? 0);
  if (!isSurge(lastHour, baseline, ANOMALY.districtSurgeFloor)) return 0;
  const flag = await flagFor("district_surge", `${billId}@${districtId}`, { lastHour, baseline7d: baseline, districtId }, now);
  const pos = await db.select({ userId: countedPositions.userId, billId: countedPositions.billId }).from(countedPositions)
    .innerJoin(verificationProfiles, eq(verificationProfiles.accountId, countedPositions.accountId)).innerJoin(readerAccounts, eq(readerAccounts.id, countedPositions.accountId))
    .where(and(eq(countedPositions.billId, billId), eq(verificationProfiles.districtId, districtId), gte(countedPositions.createdAt, from), young(now)));
  return quarantine(flag, "district_surge", pos);
}

async function sameReason(reasonHash: string, now: number) {
  const db = getDb(), since = now - ANOMALY.sameReasonWindowMs;
  const rows = await db.select({ userId: countedPositions.userId, billId: countedPositions.billId, accountId: countedPositions.accountId }).from(countedPositions)
    .where(and(eq(countedPositions.reasonHash, reasonHash), gte(countedPositions.updatedAt, since)));
  const accounts = new Set(rows.map(r => r.accountId)).size;
  if (accounts < ANOMALY.sameReasonAccounts) return 0;
  const flag = await flagFor("same_reason", reasonHash, { accounts }, now);
  return quarantine(flag, "same_reason", rows);
}

/** Network or device clusters at sign-up: every position of those accounts is quarantined, now and later. */
async function cluster(kind: "ip_cluster" | "device_cluster", value: string, now: number) {
  const db = getDb(), col = kind === "ip_cluster" ? verificationProfiles.signupIpRange : verificationProfiles.signupDevice;
  const min = kind === "ip_cluster" ? ANOMALY.ipClusterAccounts : ANOMALY.deviceClusterAccounts;
  const accounts = await db.select({ accountId: verificationProfiles.accountId }).from(verificationProfiles)
    .where(and(eq(col, value), ...(kind === "ip_cluster" ? [gte(verificationProfiles.createdAt, now - ANOMALY.clusterWindowMs)] : [])));
  if (accounts.length < min) return 0;
  const flag = await flagFor(kind, value, { accounts: accounts.length }, now);
  const pos = await db.select({ userId: countedPositions.userId, billId: countedPositions.billId }).from(countedPositions)
    .where(inArray(countedPositions.accountId, accounts.map(a => a.accountId)));
  const n = await quarantine(flag, kind, pos);
  for (const b of new Set(pos.map(p => p.billId))) await recomputeBill(b);
  return n;
}

export async function checkSignup(profile: { signupIpRange: string | null; signupDevice: string | null }, now = Date.now()) {
  if (profile.signupIpRange) await cluster("ip_cluster", profile.signupIpRange, now);
  if (profile.signupDevice) await cluster("device_cluster", profile.signupDevice, now);
}

/** After a counted write. Returns how many positions this check quarantined. */
export async function checkPosition(input: { billId: string; districtId: string | null; reasonHash: string | null; profile: { signupIpRange: string | null; signupDevice: string | null } }, now = Date.now()) {
  let n = await billSurge(input.billId, now);
  if (input.districtId) n += await districtSurge(input.billId, input.districtId, now);
  if (input.reasonHash) n += await sameReason(input.reasonHash, now);
  // A position from an account already inside a network or device cluster joins that flag.
  if (input.profile.signupIpRange) n += await cluster("ip_cluster", input.profile.signupIpRange, now);
  if (input.profile.signupDevice) n += await cluster("device_cluster", input.profile.signupDevice, now);
  return n;
}

/** Editor decision: "clear" returns the positions to the totals; "confirm" keeps them out. Nothing is deleted. */
export async function decideFlag(flagId: string, decision: "clear" | "confirm") {
  const db = getDb();
  const flag = await db.select().from(integrityFlags).where(eq(integrityFlags.id, flagId)).get();
  if (!flag) return false;
  await db.update(integrityFlags).set({ status: decision === "clear" ? "cleared" : "confirmed", decidedAt: Date.now() }).where(eq(integrityFlags.id, flagId));
  const bills = await db.selectDistinct({ billId: flaggedPositions.billId }).from(flaggedPositions).where(eq(flaggedPositions.flagId, flagId));
  for (const b of bills) await recomputeBill(b.billId);
  return true;
}

export async function flagsForEditor(limit = 50) {
  const db = getDb();
  const rows = await db.select({ id: integrityFlags.id, kind: integrityFlags.kind, subject: integrityFlags.subject, detail: integrityFlags.detail, status: integrityFlags.status,
    createdAt: integrityFlags.createdAt, decidedAt: integrityFlags.decidedAt,
    positions: sql<number>`(select count(*) from flagged_positions fp where fp.flag_id = ${integrityFlags.id})` })
    .from(integrityFlags).orderBy(sql`case ${integrityFlags.status} when 'open' then 0 else 1 end`, sql`${integrityFlags.createdAt} desc`).limit(limit);
  return rows;
}
