import { gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { alertPrefs, billFollows, briefingSubscriptions, pushSubscriptions, readerAccounts, readerVisits, userFollows } from "@/db/schema";
import { eventTotals } from "@/lib/events";

/** Round D retention, aggregate counts only (probe and editor). No reader, page or bill is identified. */
export async function retentionCounts(now = Date.now()) {
  const db = getDb(), week = now - 7 * 86400e3;
  const one = async (q: Promise<{ n: number } | undefined>) => Number((await q)?.n ?? 0);
  const [active, returning, followers, follows, billFollowers, billFollowsN, instant, push, briefing, digest, events] = await Promise.all([
    one(db.select({ n: sql<number>`count(*)` }).from(readerVisits).where(gte(readerVisits.lastSeenAt, week)).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(readerVisits).where(sql`${readerVisits.lastSeenAt} >= ${week} and ${readerVisits.previousSeenAt} is not null`).get()),
    one(db.select({ n: sql<number>`count(distinct ${userFollows.userId})` }).from(userFollows).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(userFollows).get()),
    one(db.select({ n: sql<number>`count(distinct ${billFollows.userId})` }).from(billFollows).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(billFollows).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(alertPrefs).where(sql`${alertPrefs.instantVotes} = 1`).get()),
    one(db.select({ n: sql<number>`count(distinct ${pushSubscriptions.userId})` }).from(pushSubscriptions).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(briefingSubscriptions).get()),
    one(db.select({ n: sql<number>`count(*)` }).from(readerAccounts).where(sql`${readerAccounts.digestOptIn} = 1`).get()),
    eventTotals(7).catch(() => []),
  ]);
  const ev = (name: string, prefix?: string) => events.filter(e => e.name === name && (!prefix || e.dim.startsWith(prefix))).reduce((s, e) => s + Number(e.n), 0);
  const started = ev("onboarding_start"), done = ev("onboarding_done");
  return { weeklyActiveReaders: active, weeklyReturningReaders: returning,
    onboarding7d: { started, completed: done, completionPct: started ? Math.round((1000 * done) / started) / 10 : null },
    followsPerFollower: followers ? Math.round((10 * follows) / followers) / 10 : null, readersFollowingMembers: followers, readersFollowingBills: billFollowers, billFollows: billFollowsN,
    alertOptIn: { instantVotes: instant, pushReaders: push, briefingEmail: briefing, weeklyEmail: digest },
    shares7d: { cardsRendered: ev("card_render"), shareSheet: ev("share_native"), downloads: ev("share_download"), linkCopies: ev("share_copy") } };
}
