/**
 * Defaults for a new reader (owner, 18 Nov 2026; docs/PERSUASION_RETENTION.md, point 2): the first time a reader saves
 * a place, their own legislators are followed and vote alerts are on. Issues are asked for once, as a second step.
 *
 * The rule, in one sentence: on each save of a place, the site follows the legislators of the new place who were not
 * legislators of the place before; the first save has no place before, so all of them are followed.
 * So a legislator the reader later unfollows is not followed again, and a reader who moves follows the new ones.
 * The place the defaults were made for is kept in reader_setup (place_key, defaults_at): district codes only.
 *
 * Nothing here sends anything. Delivery still needs the reader: a device asks permission before it shows a
 * notification, and email needs an address.
 *
 * The rule is pure; the database functions take the handle and read no request and no secret, so
 * tests/first-screen.test.mjs runs them against a temporary database built from the real migrations.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { alertPrefs, officialPoliticians, pushSubscriptions, readerAccounts, readerSetup, txPeople, userFollows } from "../db/schema.ts";
import type { Db } from "./verify/residence-store.ts";

/* ------------------------------------------------------------------- the place --- */

/** District codes only: "TX", "TX-37", "TX-SD-14", "TX-HD-49" (lib/location.ts). Never an address. */
export type Place = { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null };

/** "TX|TX-37|TX-SD-14|TX-HD-49". How the place was found (ZIP or address) is not part of it. */
export function placeKey(p: Place): string {
  return [p.state, p.congressional ?? "", p.stateUpper ?? "", p.stateLower ?? ""].join("|");
}
export function placeFromKey(key: string | null | undefined): Place | null {
  const [state, cd, su, sl, extra] = String(key ?? "").split("|");
  if (!state || !/^[A-Z]{2}$/.test(state) || extra !== undefined) return null;
  return { state, congressional: cd || null, stateUpper: su || null, stateLower: sl || null };
}

/* -------------------------------------------------------------------- the rule --- */

export type FollowPlan = { follow: string[]; first: boolean; record: boolean };

/**
 * Who to follow when a place is saved.
 *   no place before          → everyone at the new place (the first save);
 *   the same place again     → nobody (an unfollowed legislator stays unfollowed);
 *   a different place        → only the legislators who are new with it.
 * `record` says whether reader_setup should now name the new place.
 */
export function followPlan(i: { baseKey: string | null; newKey: string; baseMembers: readonly string[]; members: readonly string[] }): FollowPlan {
  const members = [...new Set(i.members)];
  if (i.baseKey === null) return { follow: members, first: true, record: true };
  if (i.baseKey === i.newKey) return { follow: [], first: false, record: false };
  const before = new Set(i.baseMembers);
  return { follow: members.filter(m => !before.has(m)), first: false, record: true };
}

/* ------------------------------------------------------- who represents a place --- */

const FEDERAL_ID = /^[A-Z]\d{6}$/;

/**
 * The ids of the current legislators for a place, in card order: U.S. senators, the U.S. representative, then (Texas
 * only, where the state tables exist) the state senator and the state representative. The same choice as
 * lib/federal/legislators.ts and lib/texas/queries.ts make for the cards.
 */
export async function placeMemberIds(db: Db, place: Place): Promise<string[]> {
  const rows = await db.select({ id: officialPoliticians.id, chamber: officialPoliticians.chamber, district: officialPoliticians.district, lastName: officialPoliticians.lastName })
    .from(officialPoliticians).where(and(eq(officialPoliticians.state, place.state.toUpperCase()), eq(officialPoliticians.isCurrent, 1)));
  const senators = rows.filter(r => r.chamber === "senate").sort((a, b) => a.lastName.localeCompare(b.lastName)).map(r => r.id);
  const n = place.congressional?.split("-")[1];
  const rep = n ? rows.filter(r => r.chamber === "house").find(h => (n === "AL" ? !h.district : h.district === Number(n))) : undefined;
  const out = [...senators, ...(rep ? [rep.id] : [])];
  if (place.state === "TX") {
    const seat = async (chamber: "upper" | "lower", district: string | null) => {
      const d = district?.split("-").pop();
      return d ? (await db.select({ id: txPeople.id }).from(txPeople).where(and(eq(txPeople.chamber, chamber), eq(txPeople.district, d), eq(txPeople.isCurrent, 1))).get())?.id ?? null : null;
    };
    for (const id of [await seat("upper", place.stateUpper), await seat("lower", place.stateLower)]) if (id) out.push(id);
  }
  return out;
}

/** Whether an id is a member the site knows: a member of Congress (Biographical Directory id) or a Texas legislator (tx_people id). */
export async function memberKind(db: Db, id: string): Promise<"federal" | "texas" | null> {
  if (!id || id.length > 120) return null;
  if (FEDERAL_ID.test(id)) return (await db.select({ id: officialPoliticians.id }).from(officialPoliticians).where(eq(officialPoliticians.id, id)).get()) ? "federal" : null;
  return (await db.select({ id: txPeople.id }).from(txPeople).where(eq(txPeople.id, id)).get()) ? "texas" : null;
}

/** Follow or unfollow one member. Only a known member can be followed. */
export async function toggleMemberFollow(db: Db, userId: string, memberId: string, now = Date.now()): Promise<{ kind: "federal" | "texas"; following: boolean } | null> {
  const kind = await memberKind(db, memberId);
  if (!kind) return null;
  const where = and(eq(userFollows.userId, userId), eq(userFollows.politicianId, memberId));
  if (await db.select({ id: userFollows.politicianId }).from(userFollows).where(where).get()) { await db.delete(userFollows).where(where); return { kind, following: false }; }
  await db.insert(userFollows).values({ userId, politicianId: memberId, createdAt: now }).onConflictDoNothing();
  return { kind, following: true };
}

/* ------------------------------------------------------------ applying defaults --- */

async function follow(db: Db, userId: string, ids: readonly string[], now: number) {
  if (ids.length) await db.insert(userFollows).values(ids.map(politicianId => ({ userId, politicianId, createdAt: now }))).onConflictDoNothing();
}
/** Vote alerts on, only for a reader who has never had an alert setting: an existing choice is never changed. */
async function alertsOnIfUnset(db: Db, userId: string, now: number): Promise<boolean> {
  if (await db.select({ id: alertPrefs.userId }).from(alertPrefs).where(eq(alertPrefs.userId, userId)).get()) return false;
  await db.insert(alertPrefs).values({ userId, instantVotes: 1, instantBills: 1, push: 0, updatedAt: now }).onConflictDoNothing();
  return true;
}
async function recordPlace(db: Db, userId: string, key: string, now: number) {
  await db.insert(readerSetup).values({ userId, placeKey: key, defaultsAt: now, firstSeenAt: now }).onConflictDoUpdate({ target: readerSetup.userId, set: { placeKey: key, defaultsAt: now } });
}

export type DefaultsResult = { first: boolean; followed: string[]; alertsTurnedOn: boolean };

/**
 * Called each time a reader's place is saved. `previous` is the place they had before this save (null on a first
 * save). Readers who set a place before this rule existed have no reader_setup row: for them the place before is
 * `previous`, so nobody is followed behind their back; the screen offers one "Follow all" button instead.
 */
export async function applyFollowDefaults(db: Db, i: { userId: string; place: Place; previous: Place | null; now?: number }): Promise<DefaultsResult> {
  const now = i.now ?? Date.now(), newKey = placeKey(i.place);
  const setup = await db.select().from(readerSetup).where(eq(readerSetup.userId, i.userId)).get();
  const baseKey = setup?.defaultsAt && setup.placeKey ? setup.placeKey : i.previous ? placeKey(i.previous) : null;
  const basePlace = baseKey && baseKey !== newKey ? placeFromKey(baseKey) : null;
  const [members, baseMembers] = await Promise.all([placeMemberIds(db, i.place), basePlace ? placeMemberIds(db, basePlace) : Promise.resolve([] as string[])]);
  const plan = followPlan({ baseKey, newKey, baseMembers, members });
  await follow(db, i.userId, plan.follow, now);
  const alertsTurnedOn = plan.first ? await alertsOnIfUnset(db, i.userId, now) : false;
  if (plan.record) await recordPlace(db, i.userId, newKey, now);
  return { first: plan.first, followed: plan.follow, alertsTurnedOn };
}

/**
 * The one button for a reader who does not follow all of their own legislators: follow every one of them. It also
 * turns vote alerts on when the reader has never chosen (the screen says so beside the button), and records the place
 * so a later unfollow is kept.
 */
export async function followAllAt(db: Db, i: { userId: string; place: Place; now?: number }): Promise<{ total: number; alertsTurnedOn: boolean }> {
  const now = i.now ?? Date.now(), members = await placeMemberIds(db, i.place);
  await follow(db, i.userId, members, now);
  const alertsTurnedOn = await alertsOnIfUnset(db, i.userId, now);
  await recordPlace(db, i.userId, placeKey(i.place), now);
  return { total: members.length, alertsTurnedOn };
}

/* ------------------------------------------------------- what the screen reads --- */

export type FollowState = { followed: number; total: number; alertsOn: boolean; alertsChosen: boolean; devices: number; hasEmail: boolean };

/** For the line under the cards: how many of these legislators the reader follows, whether vote alerts are on, and how an alert could reach them. */
export async function followState(db: Db, userId: string, memberIds: readonly string[]): Promise<FollowState> {
  const ids = [...new Set(memberIds)];
  const [follows, prefs, devices, account] = await Promise.all([
    db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId)),
    db.select({ instantVotes: alertPrefs.instantVotes }).from(alertPrefs).where(eq(alertPrefs.userId, userId)).get(),
    db.select({ n: sql<number>`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).get(),
    db.select({ id: readerAccounts.id }).from(readerAccounts).where(and(eq(readerAccounts.appUserId, userId), isNotNull(readerAccounts.verifiedAt))).get(),
  ]);
  const mine = new Set(follows.map(f => f.id));
  return { followed: ids.filter(id => mine.has(id)).length, total: ids.length, alertsOn: !!prefs?.instantVotes, alertsChosen: !!prefs, devices: Number(devices?.n ?? 0), hasEmail: !!account };
}

/* ---------------------------------------------------------- the issues step --- */

/** Whether the "Pick up to three issues" step has been answered (issues saved, or "Skip for now"). It is asked once. */
export async function issuesAsked(db: Db, userId: string): Promise<boolean> {
  return !!(await db.select({ at: readerSetup.issuesAskedAt }).from(readerSetup).where(eq(readerSetup.userId, userId)).get())?.at;
}
/** Records that the step was put to the reader and answered, so it is not asked again. The first time stands. */
export async function markIssuesAsked(db: Db, userId: string, now = Date.now()) {
  await db.insert(readerSetup).values({ userId, issuesAskedAt: now, firstSeenAt: now })
    .onConflictDoUpdate({ target: readerSetup.userId, set: { issuesAskedAt: sql`coalesce(${readerSetup.issuesAskedAt}, ${now})` } });
}
