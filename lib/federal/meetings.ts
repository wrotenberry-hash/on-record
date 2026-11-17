import { and, asc, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialCommitteeMeetings } from "@/db/schema";
import { fetchText, type Step } from "@/lib/federal/ingest";
import { CONGRESS_API, congressForYear } from "@/lib/federal/parse";
import { detailsDue, isUpcoming, MEETING_LIST_LIMIT, MEETING_WINDOW_DAYS, meetingDetailUrl, meetingId, meetingListUrl, parseMeetingDetail, parseMeetingList,
  type MeetingListItem } from "@/lib/federal/meetings-parse";

/**
 * Committee hearings and markups from Congress.gov (test-ready build). No model calls. Per chamber: one list call for
 * meetings updated in the last LOOKBACK_DAYS (a second only if the first page holds nothing recent), then the detail of
 * each meeting that is new or was updated since it was stored, newest update first, at most DETAILS_PER_CHAMBER a run.
 * The list carries no meeting date, so every detail read is stored, whenever the meeting is; pages show only the
 * upcoming ones. What is left over is picked up next run. Needs CONGRESS_GOV_API_KEY, like the other Congress.gov steps.
 */
type Db = ReturnType<typeof getDb>;
const DETAILS_PER_CHAMBER = 25, LOOKBACK_DAYS = 10, AT_ONCE = 4;
const safe = async (url: string, headers: Record<string, string>) => fetchText(url, 20_000, headers).catch(() => ({ status: 0, ok: false, text: "" }));
const json = (t: string) => { try { return JSON.parse(t) as unknown; } catch { return null; } };

export async function ingestMeetings(db: Db, deadline: number, now = Date.now(), cap = DETAILS_PER_CHAMBER): Promise<Step> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY?.trim();
  if (!apiKey) return { ok: true, skipped: "CONGRESS_GOV_API_KEY is not set" };
  const headers = { "X-Api-Key": apiKey }, congress = congressForYear(new Date(now).getUTCFullYear());
  const since = new Date(now - LOOKBACK_DAYS * 86400e3).toISOString();
  let listed = 0, read = 0, stored = 0, upcoming = 0, unreadable = 0, left = 0, requests = 0;
  const problems: string[] = [];
  const done = (ok: boolean, error?: string): Step => {
    const out = { ok, ...(error ? { error } : {}), listed, read, stored, upcoming, unreadable, left, requests, ...(problems.length ? { note: problems.join("; ") } : {}) };
    console.log(`[meetings] listed=${listed} read=${read} stored=${stored} upcoming=${upcoming} unreadable=${unreadable} left=${left} requests=${requests}${error ? ` error=${error}` : ""}`);
    return out;
  };
  for (const chamber of ["house", "senate"] as const) {
    if (Date.now() > deadline - 15_000) { problems.push(`${chamber}: no time left`); continue; }
    const first = await safe(meetingListUrl(CONGRESS_API, congress, chamber, { since }), headers); requests++;
    if (first.status === 429) return done(false, "Congress.gov rate limit reached");
    if (!first.ok) { problems.push(`${chamber} list answered ${first.status}`); continue; }
    const page = parseMeetingList(json(first.text));
    let items: MeetingListItem[] = page.items;
    // If the first page holds nothing updated lately (the list may come oldest first), read the last page as well.
    if (!items.some(i => i.updateDate && i.updateDate >= since) && page.count !== null && page.count > items.length) {
      const last = await safe(meetingListUrl(CONGRESS_API, congress, chamber, { since, offset: Math.max(0, page.count - MEETING_LIST_LIMIT) }), headers); requests++;
      if (last.status === 429) return done(false, "Congress.gov rate limit reached");
      if (last.ok) items = [...items, ...parseMeetingList(json(last.text)).items.filter(i => !items.some(x => x.eventId === i.eventId))];
    }
    listed += items.length;
    const recent = items.filter(i => !i.updateDate || i.updateDate >= since);
    const ids = recent.map(i => meetingId(i.congress ?? congress, i.chamber ?? chamber, i.eventId));
    const have = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 100) for (const r of await db.select({ id: officialCommitteeMeetings.id, at: officialCommitteeMeetings.retrievedAt }).from(officialCommitteeMeetings)
      .where(inArray(officialCommitteeMeetings.id, ids.slice(i, i + 100)))) have.set(r.id, r.at);
    const all = detailsDue(recent, have, congress, chamber, Number.MAX_SAFE_INTEGER), due = all.slice(0, cap);
    left += all.length - due.length;
    for (let i = 0; i < due.length; i += AT_ONCE) {
      if (Date.now() > deadline - 10_000) { left += due.length - i; problems.push(`${chamber}: stopped for time`); break; }
      const part = due.slice(i, i + AT_ONCE);
      const answers = await Promise.all(part.map(d => safe(meetingDetailUrl(CONGRESS_API, congress, chamber, d.eventId), headers))); requests += part.length;
      if (answers.some(a => a.status === 429)) return done(false, "Congress.gov rate limit reached");
      for (const [k, a] of answers.entries()) {
        read++;
        const m = a.ok ? parseMeetingDetail(json(a.text), { congress, chamber, eventId: part[k].eventId }) : null;
        if (!m) { unreadable++; continue; }
        const row = { congress: m.congress, chamber: m.chamber, committeeCode: m.committeeCodes.join(",") || null, committeeName: m.committeeName, title: m.title.slice(0, 2000),
          meetingType: m.meetingType, status: m.status, startsAt: m.startsAt, location: m.location, billIds: m.billIds, url: m.url, retrievedAt: Date.now() };
        await db.insert(officialCommitteeMeetings).values({ id: m.id, ...row }).onConflictDoUpdate({ target: officialCommitteeMeetings.id, set: row });
        stored++; if (isUpcoming(m.startsAt, now)) upcoming++;
      }
    }
  }
  // A list that could not be read at all is a failure of this step only; the run carries on (see runFederalIngest's step wrapper).
  return problems.filter(p => /list answered/.test(p)).length === 2 ? done(false, problems.join("; ")) : done(true);
}

/** Meetings from now on (three hours' grace), soonest first. */
export async function upcomingMeetings(now = Date.now(), days = MEETING_WINDOW_DAYS, limit = 120) {
  const from = new Date(now - 3 * 3600e3).toISOString(), to = new Date(now + days * 86400e3).toISOString();
  return getDb().select().from(officialCommitteeMeetings).where(and(gte(officialCommitteeMeetings.startsAt, from), sql`${officialCommitteeMeetings.startsAt} <= ${to}`))
    .orderBy(asc(officialCommitteeMeetings.startsAt)).limit(limit);
}

/** Count only, for the health probe. */
export async function upcomingMeetingCount(db: Db = getDb(), now = Date.now()) {
  const from = new Date(now - 3 * 3600e3).toISOString();
  return Number((await db.select({ n: sql<number>`count(*)` }).from(officialCommitteeMeetings).where(gte(officialCommitteeMeetings.startsAt, from)).get())?.n ?? 0);
}
