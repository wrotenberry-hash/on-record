/**
 * Confirming upcoming committee meetings against each chamber's own calendar, and making sure the bills those
 * meetings name are on file (owner, 20 Nov 2026; the rule itself is in ./hearing-check.ts). No model calls.
 *
 * No new table and no migration. Confirmations are one JSON value in the existing key-value store for ingest cursors
 * (table ingest_cursors, the one lib/federal/ingest.ts getCursor/setCursor use), under the key "hearings:confirmed":
 * meeting id → { startsAt, checkedAt, source }, kept only for meetings that are still ahead.
 *
 * Relative imports only, and the database handle can be passed in, so tests/window.test.mjs runs these functions
 * against a temporary database built from the migrations, with a stand-in for the network.
 */
import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import { ingestCursors, officialBills, officialCommitteeMeetings } from "../../db/schema.ts";
import { BRAND } from "../brand.ts";
import { billIdLabel, meetingBillIds, MEETING_WINDOW_DAYS } from "../federal/meetings-parse.ts";
import { congressGovPage } from "../federal/parse.ts";
import type { Db } from "../verify/residence-store.ts";
import { checkMeeting, houseEventUrl, parseConfirmations, parseHouseEventPage, parseSenateHearings, pruneConfirmations, SENATE_HEARINGS_URL, statusGoingAhead,
  CONFIRM_FRESH_MS, type ChamberListing, type Confirmation } from "./hearing-check.ts";

export const CONFIRMED_KEY = "hearings:confirmed";
/** House pages read in one run, at most. The Senate's whole schedule is one request. */
const HOUSE_PER_RUN = 8, PAGE_TIMEOUT_MS = 8_000, PAUSE_MS = 400;
/** A confirmation is checked again after this long: sooner for a meeting in the next day and a half. Both are well inside the 36 hours it counts for. */
const RECHECK_SOON_MS = 2 * 3600e3, RECHECK_LATER_MS = 8 * 3600e3, SOON_MS = 36 * 3600e3;

export type Fetched = { ok: boolean; status: number; text: string };
export type Fetcher = (url: string, timeoutMs: number) => Promise<Fetched>;
const USER_AGENT = `${BRAND.userAgentName}/0.2 (+https://on-record-wrotenberry.vercel.app)`;
const liveFetch: Fetcher = async (url, timeoutMs) => {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch { return { ok: false, status: 0, text: "" }; }
};
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
/** The site's own database unless one is handed in (tests hand one in; "@/db" is only loaded on the running site). */
const handle = async (db?: Db): Promise<Db> => db ?? (await import("@/db")).getDb();

// The same rows lib/federal/ingest.ts getCursor/setCursor read and write (that file cannot be loaded outside the site).
async function readCursor(db: Db, key: string) { return (await db.select().from(ingestCursors).where(eq(ingestCursors.key, key)).get())?.value ?? null; }
async function writeCursor(db: Db, key: string, value: string) {
  await db.insert(ingestCursors).values({ key, value, updatedAt: Date.now() }).onConflictDoUpdate({ target: ingestCursors.key, set: { value, updatedAt: Date.now() } });
}

/** Meetings that have not started yet, soonest first, up to three weeks ahead. */
export async function meetingsAhead(db: Db, now: number, limit = 400) {
  const from = new Date(now).toISOString(), to = new Date(now + MEETING_WINDOW_DAYS * 86400e3).toISOString();
  return db.select().from(officialCommitteeMeetings).where(and(gt(officialCommitteeMeetings.startsAt, from), lte(officialCommitteeMeetings.startsAt, to)))
    .orderBy(asc(officialCommitteeMeetings.startsAt)).limit(limit);
}
export const eventIdOf = (meetingId: string) => meetingId.split("-").slice(2).join("-");

/** The confirmations on file that are no older than 36 hours, for meetings still ahead. Whether one still stands for a meeting is `confirmationHolds`. */
export async function confirmedHearings(now = Date.now(), db?: Db): Promise<Map<string, Confirmation>> {
  const all = pruneConfirmations(parseConfirmations(await readCursor(await handle(db), CONFIRMED_KEY)), now);
  return new Map([...all].filter(([, c]) => now - c.checkedAt <= CONFIRM_FRESH_MS));
}

export type ConfirmRun = { ok: boolean; error?: string; upcoming: number; withBills: number; due: number; checked: number; confirmed: number; notConfirmed: number; unreachable: number; left: number; onFile: number };

/**
 * One run: check upcoming meetings that name a bill against the chamber's own calendar, soonest first. The Senate's
 * schedule is one request; House events are a page each, at most HOUSE_PER_RUN a run, a short pause apart. A meeting
 * the chamber's page contradicts (other time, called off, not listed) loses its confirmation at once. A page that
 * could not be reached changes nothing: an earlier confirmation simply runs out at 36 hours.
 */
export async function confirmHearings(now = Date.now(), budgetMs = 15_000, opts: { db?: Db; fetcher?: Fetcher; houseCap?: number; pauseMs?: number } = {}): Promise<ConfirmRun> {
  const db = await handle(opts.db), fetcher = opts.fetcher ?? liveFetch, deadline = Date.now() + budgetMs;
  const rows = await meetingsAhead(db, now), withBills = rows.filter(m => meetingBillIds(m).length > 0);
  const onFile = pruneConfirmations(parseConfirmations(await readCursor(db, CONFIRMED_KEY)), now);
  const run: ConfirmRun = { ok: true, upcoming: rows.length, withBills: withBills.length, due: 0, checked: 0, confirmed: 0, notConfirmed: 0, unreachable: 0, left: 0, onFile: 0 };
  const known = new Set(withBills.map(m => m.id));
  for (const id of [...onFile.keys()]) if (!known.has(id)) onFile.delete(id); // the meeting is gone from the record
  const due = withBills.filter(m => {
    // Nothing to confirm for a meeting that is called off, or for a joint meeting: neither chamber's calendar carries it.
    if (!statusGoingAhead(m.status) || (m.chamber !== "house" && m.chamber !== "senate")) { onFile.delete(m.id); return false; }
    const c = onFile.get(m.id);
    return !c || c.startsAt !== m.startsAt || now - c.checkedAt > (Date.parse(m.startsAt) - now < SOON_MS ? RECHECK_SOON_MS : RECHECK_LATER_MS);
  });
  run.due = due.length;
  const settle = (m: (typeof rows)[number], listing: ChamberListing | null, source: string) => {
    run.checked++;
    if (checkMeeting(m, listing).confirmed) { onFile.set(m.id, { startsAt: m.startsAt, checkedAt: now, source }); run.confirmed++; }
    else { onFile.delete(m.id); run.notConfirmed++; }
  };
  const timeLeft = () => deadline - Date.now();

  const senate = due.filter(m => m.chamber === "senate");
  if (senate.length) {
    const res = timeLeft() > 2_000 ? await fetcher(SENATE_HEARINGS_URL, Math.min(PAGE_TIMEOUT_MS, timeLeft())) : null;
    // Only the schedule itself counts as an answer; an error page or a block page is "could not be reached".
    if (res?.ok && /<css_meetings_scheduled[\s>]/i.test(res.text)) { const listed = parseSenateHearings(res.text); for (const m of senate) settle(m, listed.get(eventIdOf(m.id)) ?? null, SENATE_HEARINGS_URL); }
    else if (res) run.unreachable += senate.length;
    else run.left += senate.length;
  }
  const house = due.filter(m => m.chamber === "house"), cap = Math.max(0, opts.houseCap ?? HOUSE_PER_RUN);
  run.left += Math.max(0, house.length - cap);
  for (const [i, m] of house.slice(0, cap).entries()) {
    if (timeLeft() < 2_000) { run.left += Math.min(house.length, cap) - i; break; }
    if (i) await pause(opts.pauseMs ?? PAUSE_MS);
    const url = houseEventUrl(eventIdOf(m.id)), res = await fetcher(url, Math.min(PAGE_TIMEOUT_MS, Math.max(1_000, timeLeft())));
    if (res.ok) settle(m, parseHouseEventPage(res.text, eventIdOf(m.id)), url);
    else if (res.status === 404 || res.status === 410) settle(m, null, url); // the House says there is no such event
    else run.unreachable++;
  }
  await writeCursor(db, CONFIRMED_KEY, JSON.stringify(Object.fromEntries(onFile)));
  run.onFile = onFile.size;
  console.log(`[hearings] upcoming=${run.upcoming} withBills=${run.withBills} due=${run.due} checked=${run.checked} confirmed=${run.confirmed} notConfirmed=${run.notConfirmed} unreachable=${run.unreachable} left=${run.left} onFile=${run.onFile}`);
  return run;
}

/**
 * Bills named by upcoming committee meetings (in the record or in the title) get a starter bill record when they have
 * none, the way lib/federal/depth.ts ensureFloorBillStubs does for floor bills, so bills still in committee are
 * loaded. The bill step completes each record later. Existing records are untouched. At most `cap` a run, soonest
 * meeting first; the rest are picked up next run.
 */
export async function ensureMeetingBillStubs(now = Date.now(), cap = 40, db?: Db): Promise<{ named: number; added: number; left: number }> {
  const d = await handle(db), rows = await meetingsAhead(d, now);
  const stubs = new Map<string, { id: string; congress: number; billType: string; number: number; title: string; congressUrl: string; detailStatus: "stub"; sourceUrl: string; retrievedAt: number }>();
  for (const m of rows) for (const id of meetingBillIds(m)) {
    const x = /^(\d{2,3})-([a-z]+)-(\d+)$/.exec(id);
    if (!x || stubs.has(id)) continue;
    const ref = { id, congress: Number(x[1]), billType: x[2], number: Number(x[3]) };
    stubs.set(id, { ...ref, title: billIdLabel(id), congressUrl: congressGovPage(ref), detailStatus: "stub", sourceUrl: m.url, retrievedAt: now });
  }
  const ids = [...stubs.keys()], have = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) for (const r of await d.select({ id: officialBills.id }).from(officialBills).where(inArray(officialBills.id, ids.slice(i, i + 100)))) have.add(r.id);
  const missing = ids.filter(id => !have.has(id)), add = missing.slice(0, Math.max(0, cap)).map(id => stubs.get(id)!);
  if (add.length) await d.insert(officialBills).values(add).onConflictDoNothing();
  return { named: ids.length, added: add.length, left: missing.length - add.length };
}
