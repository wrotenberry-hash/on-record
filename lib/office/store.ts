/**
 * Legislator office access: the database side of lib/office/domains.ts, lib/office/rules.ts and lib/office/email.ts
 * (owner, 18 Nov 2026, point 7). Every function takes the database handle and reads no request and no secret, so
 * tests/office.test.mjs runs these same functions against a temporary database built from the real migrations.
 * Cookies, signed links and keyed hashes are in lib/office/session.ts; only a keyed hash of the address arrives here.
 *
 * What an office can read: totals for its own member's scope, each already through `shownTotals`. Nothing in this
 * file returns a reader, an account, an answer or a reason. The one query that reads single answers
 * (`countedInScope`) is not exported; only the weekly counts and issue counts built from it leave the file.
 */
import { settledOf } from "../changes/window-store.ts";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { accessLinks, billCategories, billJurisdictions, flaggedPositions, integrityFlags, issueCategories, legislatorContacts, officeAccounts, officeEmailSends, officialBills,
  officialFloorSchedule, officialMemberVotes, officialPoliticians, officialRollCalls, positionResidences, txBills, txEvents, txMemberVotes, txPeople, txVotes, voiceVotes } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import { billsWithTotals, totalsForScope } from "../constituent/store.ts";
import { placeName, scopeForMember, shownTotals, tierOf, voteCounts, type Answer, type Jurisdiction } from "../constituent/rules.ts";
import { positionLine, voteKind } from "../federal/vote-kinds.ts";
import { weekOf } from "../federal/depth-parse.ts";
import { txEventBillIds } from "../texas/parse.ts";
import { addDays, txToday } from "../texas/calendar.ts";
import { optionLine } from "../texas/vote-record.ts";
import { domainOf, matchDomain, officeEmail, officeProof, officeRule, senateSiteLabel, statusOnConfirm, type DomainMatch, type OfficeDomainRule, type OfficeFacts, type OfficeProof } from "./domains.ts";
import { isoDay, LIST_MAX, longDate, OFFICE_LINK_TTL_MS, RECENT_ACTION_DAYS, RECENT_VOTE_DAYS, TOP_ISSUES, trendWeeks, weekStart, weekVoters,
  type MemberVote, type OfficeBill, type OfficeDashboard, type OfficeMember, type TopIssue, type TrendWeek } from "./rules.ts";
import { composeOfficeEmail } from "./email.ts";

const DAY = 86400e3;
export type OfficeAccount = typeof officeAccounts.$inferSelect;

/* ───────────────────────────── The member an office works for ───────────────────────────── */

/** "fed:<bioguide id>" or "tx:<tx_people id>". */
function splitKey(key: string): ["fed" | "tx", string] | null {
  const i = key.indexOf(":"), kind = key.slice(0, i), id = key.slice(i + 1);
  return (kind === "fed" || kind === "tx") && id ? [kind, id] : null;
}

/** The member, the one scope their office may see, and how to say it. The party is never read. */
export async function memberOf(db: Db, memberKey: string): Promise<OfficeMember | null> {
  const k = splitKey(memberKey);
  if (!k) return null;
  if (k[0] === "fed") {
    const p = await db.select({ name: officialPoliticians.fullName, state: officialPoliticians.state, district: officialPoliticians.district, chamber: officialPoliticians.chamber, isCurrent: officialPoliticians.isCurrent })
      .from(officialPoliticians).where(eq(officialPoliticians.id, k[1])).get();
    if (!p) return null;
    const chamber = p.chamber === "senate" ? "upper" as const : "lower" as const, state = p.state.toUpperCase();
    const scope = scopeForMember({ level: "federal", chamber, state, district: p.district });
    return { key: memberKey, level: "federal", chamber, state, district: p.district === null ? null : String(p.district), name: p.name, current: p.isCurrent === 1,
      seat: chamber === "upper" ? "U.S. Senator" : "U.S. Representative", scope, scopeKind: chamber === "upper" ? "state" : "district",
      scopeName: chamber === "upper" ? placeName(state) : /-AL$/.test(scope) ? `${placeName(state)} (one district)` : `congressional district ${scope}` };
  }
  const p = await db.select({ name: txPeople.name, district: txPeople.district, chamber: txPeople.chamber, isCurrent: txPeople.isCurrent }).from(txPeople).where(eq(txPeople.id, k[1])).get();
  const chamber = p?.chamber === "upper" ? "upper" as const : p?.chamber === "lower" ? "lower" as const : null;
  if (!p || !chamber) return null;
  const state = "TX", body = chamber === "upper" ? "Senate" : "House";
  return { key: memberKey, level: "state", chamber, state, district: p.district, name: p.name, current: p.isCurrent === 1, seat: `${placeName(state)} ${chamber === "upper" ? "Senator" : "Representative"}`,
    scope: scopeForMember({ level: "state", chamber, state, district: p.district }), scopeKind: "district", scopeName: `${placeName(state)} ${body} district ${p.district.replace(/^0+(?=\d)/, "")}` };
}

export type MemberOption = { key: string; label: string };
/** The sitting members of the chamber a domain belongs to, for the person who must say which office they work for. */
export async function memberOptions(db: Db, rule: Pick<OfficeDomainRule, "level" | "chamber" | "state">): Promise<MemberOption[]> {
  if (rule.level === "federal") {
    const rows = await db.select({ id: officialPoliticians.id, name: officialPoliticians.fullName, state: officialPoliticians.state, district: officialPoliticians.district }).from(officialPoliticians)
      .where(and(eq(officialPoliticians.chamber, rule.chamber === "upper" ? "senate" : "house"), eq(officialPoliticians.isCurrent, 1)));
    return rows.map(r => ({ r, place: placeName(r.state.toUpperCase()).replace(/^the /, "") }))
      .sort((a, b) => a.place.localeCompare(b.place) || (a.r.district ?? 0) - (b.r.district ?? 0) || a.r.name.localeCompare(b.r.name))
      .map(({ r, place }) => ({ key: `fed:${r.id}`, label: rule.chamber === "upper" ? `${place}: ${r.name}` : `${place}, ${r.district ? `district ${r.district}` : "at large"}: ${r.name}` }));
  }
  if (rule.state !== "TX") return [];
  const rows = await db.select({ id: txPeople.id, name: txPeople.name, district: txPeople.district }).from(txPeople).where(and(eq(txPeople.chamber, rule.chamber), eq(txPeople.isCurrent, 1)));
  return rows.sort((a, b) => Number(a.district) - Number(b.district) || a.name.localeCompare(b.name)).map(r => ({ key: `tx:${r.id}`, label: `District ${r.district}: ${r.name}` }));
}

/* ───────────────────────────── What an address proves ───────────────────────────── */

/** What the official record on file says about one address (lib/office/domains.ts decides what follows from it). */
export async function officeFactsFor(db: Db, email: string, match: DomainMatch): Promise<OfficeFacts> {
  const rule = officeRule(match.ruleId);
  let senatorForLabel: string | null = null;
  if (match.ruleId === "us-senate" && match.senateLabel) {
    const senators = await db.select({ id: officialPoliticians.id, url: officialPoliticians.officialUrl }).from(officialPoliticians).where(and(eq(officialPoliticians.chamber, "senate"), eq(officialPoliticians.isCurrent, 1)));
    const hits = senators.filter(s => senateSiteLabel(s.url) === match.senateLabel);
    senatorForLabel = hits.length === 1 ? `fed:${hits[0].id}` : null;
  }
  // The member's own official address on file (today: Texas members, from the official member list).
  const contacts = await db.select({ kind: legislatorContacts.kind, memberId: legislatorContacts.memberId }).from(legislatorContacts).where(sql`lower(trim(${legislatorContacts.email})) = ${email}`);
  const owners: string[] = [];
  for (const c of contacts) {
    const key = `${c.kind === "federal" ? "fed" : "tx"}:${c.memberId}`, m = await memberOf(db, key);
    if (m && m.current && m.level === rule.level && m.chamber === rule.chamber && (!rule.state || m.state === rule.state)) owners.push(key);
  }
  return { senatorForLabel, memberForAddress: owners.length === 1 ? owners[0] : null };
}

/* ───────────────────────────── Asking for a link ───────────────────────────── */

export type OfficeRequest =
  | { ok: false; reason: "bad_email" | "domain_not_allowed" | "rate_limited" }
  /** The domain proves the chamber but not the office: the person must choose the member. */
  | { ok: false; reason: "pick_member"; rule: OfficeDomainRule; options: MemberOption[] }
  /** `send` is null when no link is to be sent (the account was closed by the editor); the caller says the same thing either way. */
  | { ok: true; send: { to: string; nonce: string; memberKey: string; expiresAt: number } | null };

/**
 * An address asks for a link. Refused unless its domain is on the list. Where the address does not name one office the
 * person's choice of member travels inside the emailed link, so only the person who can open that mailbox can set it.
 * A first request stores the address as "pending"; nothing about it is confirmed until the link is used.
 */
export async function requestOfficeAccess(db: Db, i: { email: string; emailHash: string; pickedMemberKey: string | null; now: number;
  /** Asked once, just before anything is stored or sent (the limit on links to one address). */ allow?: (email: string) => Promise<boolean> }): Promise<OfficeRequest> {
  const email = officeEmail(i.email);
  if (!email) return { ok: false, reason: "bad_email" };
  const match = matchDomain(domainOf(email));
  if (!match) return { ok: false, reason: "domain_not_allowed" };
  const proof = officeProof(match, await officeFactsFor(db, email, match)), rule = officeRule(proof.ruleId);
  let memberKey: string;
  if (proof.proven) memberKey = proof.memberKey;
  else {
    const options = await memberOptions(db, rule);
    if (!i.pickedMemberKey || !options.some(o => o.key === i.pickedMemberKey)) return { ok: false, reason: "pick_member", rule, options };
    memberKey = i.pickedMemberKey;
  }
  if (i.allow && !(await i.allow(email))) return { ok: false, reason: "rate_limited" };
  await db.insert(officeAccounts).values({ id: crypto.randomUUID(), email, emailHash: i.emailHash, domain: domainOf(email), memberKey, level: rule.level, status: "pending", createdAt: i.now }).onConflictDoNothing();
  const account = await db.select().from(officeAccounts).where(eq(officeAccounts.emailHash, i.emailHash)).get();
  if (!account || account.status === "revoked") return { ok: true, send: null };
  const nonce = crypto.randomUUID(), expiresAt = i.now + OFFICE_LINK_TTL_MS;
  await db.insert(accessLinks).values({ nonce, kind: "office", subjectId: account.id, createdAt: i.now, expiresAt });
  return { ok: true, send: { to: account.email, nonce, memberKey, expiresAt } };
}

/**
 * Uses an emailed link once. Returns the account, or null when the link is unknown, already used, expired, or the
 * account was closed. The first use confirms the address: the account becomes "active" when the address names the
 * office, and "review" (nothing shown) when it only names the chamber, until the editor confirms.
 */
export async function redeemOfficeLink(db: Db, i: { nonce: string; memberKey: string | null; now: number }): Promise<OfficeAccount | null> {
  // One statement marks the link used, so two people opening it at once cannot both get in.
  const used = await db.update(accessLinks).set({ usedAt: i.now }).where(and(eq(accessLinks.nonce, i.nonce), eq(accessLinks.kind, "office"), sql`${accessLinks.usedAt} is null`, gte(accessLinks.expiresAt, i.now)))
    .returning({ subjectId: accessLinks.subjectId });
  if (!used.length) return null;
  const account = await db.select().from(officeAccounts).where(eq(officeAccounts.id, used[0].subjectId)).get();
  if (!account || account.status === "revoked") return null;
  if (account.status === "active") { await db.update(officeAccounts).set({ lastSeenAt: i.now }).where(eq(officeAccounts.id, account.id)); return { ...account, lastSeenAt: i.now }; }
  const match = matchDomain(account.domain);
  if (!match) return null; // the domain has left the list since the account was made
  const proof = officeProof(match, await officeFactsFor(db, account.email, match)), rule = officeRule(proof.ruleId);
  const picked = !proof.proven && i.memberKey && (await memberOptions(db, rule)).some(o => o.key === i.memberKey) ? i.memberKey : null;
  const memberKey = proof.proven ? proof.memberKey : picked ?? account.memberKey;
  const set = { memberKey, level: rule.level, status: statusOnConfirm(memberKey, proof), emailVerifiedAt: account.emailVerifiedAt ?? i.now, lastSeenAt: i.now };
  await db.update(officeAccounts).set(set).where(eq(officeAccounts.id, account.id));
  return { ...account, ...set };
}

export async function officeById(db: Db, id: string): Promise<OfficeAccount | null> {
  return (await db.select().from(officeAccounts).where(eq(officeAccounts.id, id)).get()) ?? null;
}
export async function touchOffice(db: Db, id: string, now: number) { await db.update(officeAccounts).set({ lastSeenAt: now }).where(eq(officeAccounts.id, id)); }
/** The weekly email, on or off, for one office account. The opt-out link in the email and the switch on the dashboard both end here. */
export async function setWeeklyEmail(db: Db, id: string, on: boolean): Promise<boolean> {
  return (await db.update(officeAccounts).set({ weeklyEmail: on ? 1 : 0 }).where(eq(officeAccounts.id, id)).returning({ id: officeAccounts.id })).length > 0;
}

/* ───────────────────────────── The editor ───────────────────────────── */

export type OfficeForEditor = { account: OfficeAccount; member: OfficeMember | null; proof: OfficeProof | null };
/** Every office account, newest first, with the member it is for and what its address proves. For the editor only. */
export async function officesForEditor(db: Db): Promise<OfficeForEditor[]> {
  const rows = await db.select().from(officeAccounts).orderBy(desc(officeAccounts.createdAt)).limit(500);
  const out: OfficeForEditor[] = [];
  for (const account of rows) {
    const match = matchDomain(account.domain);
    out.push({ account, member: await memberOf(db, account.memberKey), proof: match ? officeProof(match, await officeFactsFor(db, account.email, match)) : null });
  }
  return out;
}

/**
 * The editor's decision. "confirm": an account waiting for review becomes active. "revoke": the account is closed and
 * its links stop working. "reopen": a closed account may ask for a link again and goes through the same rule as a new one.
 */
export async function decideOffice(db: Db, i: { id: string; decision: "confirm" | "revoke" | "reopen"; by: string; now: number }): Promise<boolean> {
  const from = i.decision === "confirm" ? ["review"] as const : i.decision === "revoke" ? ["pending", "review", "active"] as const : ["revoked"] as const;
  const to = i.decision === "confirm" ? "active" as const : i.decision === "revoke" ? "revoked" as const : "pending" as const;
  const changed = await db.update(officeAccounts).set({ status: to, decidedAt: i.now, decidedBy: i.by })
    .where(and(eq(officeAccounts.id, i.id), inArray(officeAccounts.status, [...from]), ...(i.decision === "confirm" ? [sql`${officeAccounts.emailVerifiedAt} is not null`] : []))).returning({ id: officeAccounts.id });
  return changed.length > 0;
}

/** Housekeeping: links a week past their end, and addresses that asked for a link and never used one in a week, are deleted. */
export async function purgeOfficeData(db: Db, now: number) {
  await db.delete(accessLinks).where(and(eq(accessLinks.kind, "office"), lt(accessLinks.expiresAt, now - 7 * DAY)));
  const stale = await db.select({ id: officeAccounts.id }).from(officeAccounts).where(and(eq(officeAccounts.status, "pending"), sql`${officeAccounts.emailVerifiedAt} is null`, lt(officeAccounts.createdAt, now - 7 * DAY)));
  for (const s of stale) {
    await db.delete(accessLinks).where(and(eq(accessLinks.kind, "office"), eq(accessLinks.subjectId, s.id)));
    await db.delete(officeAccounts).where(and(eq(officeAccounts.id, s.id), eq(officeAccounts.status, "pending")));
  }
  return stale.length;
}

/* ───────────────────────────── The dashboard ───────────────────────────── */

const FED_LABEL: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
const etDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const unique = <T,>(xs: readonly T[]) => [...new Set(xs)];
/** SQLite takes a limited number of values in one list. */
async function inChunks<T>(keys: readonly string[], run: (chunk: string[]) => PromiseLike<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += 200) out.push(...await run(keys.slice(i, i + 200)));
  return out;
}

/** Bills that are coming up for this member's chamber, each with the reason it is listed. Official records only. */
async function upcomingFor(db: Db, m: OfficeMember, now: number): Promise<Array<{ billKey: string; why: string }>> {
  if (m.level === "federal") {
    const chamber = m.chamber === "upper" ? "senate" : "house";
    const rows = await db.select({ billId: officialFloorSchedule.billId, week: officialFloorSchedule.weekOf }).from(officialFloorSchedule)
      .where(and(eq(officialFloorSchedule.chamber, chamber), gte(officialFloorSchedule.weekOf, weekOf(now)), sql`${officialFloorSchedule.billId} is not null`)).orderBy(asc(officialFloorSchedule.weekOf), asc(officialFloorSchedule.label));
    return rows.map(r => ({ billKey: r.billId!, why: `On the ${chamber === "senate" ? "Senate" : "House"} floor schedule for the week of ${longDate(r.week)}.` }));
  }
  const today = txToday(now), out: Array<{ billKey: string; why: string }> = [];
  for (const e of await db.select().from(txEvents).where(gte(txEvents.start, today)).orderBy(asc(txEvents.start)).limit(200))
    for (const billKey of txEventBillIds(e.bills, e.start)) out.push({ billKey, why: `On the agenda for ${longDate(e.start)}: ${e.name}.` });
  const moved = await db.select({ id: txBills.id, date: txBills.latestActionDate, what: txBills.latestActionDescription }).from(txBills)
    .where(gte(txBills.latestActionDate, addDays(today, -RECENT_ACTION_DAYS))).orderBy(desc(txBills.latestActionDate), asc(txBills.id)).limit(LIST_MAX);
  for (const b of moved) out.push({ billKey: b.id, why: `Latest action on ${longDate(b.date!)}: ${(b.what ?? "recorded").replace(/\.$/, "")}.` });
  return out;
}

/**
 * The member's own latest recorded vote on each bill, in the words the site uses everywhere: a procedural step is
 * never shown as a vote on the bill. Only votes the official record lists the member in; nothing is inferred.
 */
async function memberVotes(db: Db, m: OfficeMember, by: { since: number } | { billKeys: readonly string[] }): Promise<Map<string, MemberVote>> {
  const id = splitKey(m.key)![1], out = new Map<string, MemberVote>();
  if ("billKeys" in by && !by.billKeys.length) return out;
  if (m.level === "federal") {
    const run = (extra: ReturnType<typeof and>) => db.select({ billId: officialRollCalls.billId, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, billTitle: officialBills.title, position: officialMemberVotes.position })
      .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
      .where(and(eq(officialMemberVotes.politicianId, id), sql`${officialRollCalls.billId} is not null`, extra)).orderBy(desc(officialRollCalls.votedAt));
    const rows = "since" in by ? await run(gte(officialRollCalls.votedAt, by.since)) : await inChunks(by.billKeys, c => run(inArray(officialRollCalls.billId, c)));
    for (const r of rows.sort((a, b) => b.votedAt - a.votedAt)) if (!out.has(r.billId!))
      out.set(r.billId!, { line: positionLine(r.position, voteKind(r.question, r.billTitle ?? r.title)), on: r.question, date: etDay(r.votedAt) });
    return out;
  }
  const run = (extra: ReturnType<typeof and>) => db.select({ billId: txVotes.billId, date: txVotes.date, motion: txVotes.motion, option: txMemberVotes.option }).from(txMemberVotes)
    .innerJoin(txVotes, eq(txVotes.id, txMemberVotes.voteId)).where(and(eq(txMemberVotes.personId, id), eq(txVotes.tallyOk, 1), extra)).orderBy(desc(txVotes.date));
  const rows = "since" in by ? await run(gte(txVotes.date, isoDay(by.since))) : await inChunks(by.billKeys, c => run(inArray(txVotes.billId, c)));
  for (const r of rows.sort((a, b) => b.date.localeCompare(a.date))) if (!out.has(r.billId))
    out.set(r.billId, { line: optionLine(r.option, { action: r.motion, what: r.motion }), on: r.motion, date: r.date.slice(0, 10) });
  return out;
}

/** Label, official title and page of each bill at this office's level. A bill of another level is simply absent. */
async function billInfo(db: Db, m: OfficeMember, keys: readonly string[]): Promise<Map<string, { label: string; title: string; href: string }>> {
  const out = new Map<string, { label: string; title: string; href: string }>();
  if (m.level === "federal") for (const b of await inChunks(keys, c => db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title }).from(officialBills).where(inArray(officialBills.id, c))))
    out.set(b.id, { label: `${FED_LABEL[b.billType] ?? b.billType.toUpperCase()} ${b.number}`, title: b.title, href: `/bills/${b.id}` });
  else for (const b of await inChunks(keys, c => db.select({ id: txBills.id, identifier: txBills.identifier, title: txBills.title }).from(txBills).where(inArray(txBills.id, c))))
    out.set(b.id, { label: b.identifier, title: b.title, href: `/texas/bills/${b.id}` });
  return out;
}

/**
 * The counted answers on these bills from residents of one scope: who (never returned further), which bill, and when
 * the answer was given. NOT exported. It applies the same counting rule as the totals (`voteCounts`), with the same
 * facts as `voteFacts` in lib/constituent/store.ts plus the time and the bill; `voteFacts` does not return those.
 */
async function countedInScope(db: Db, scope: string, billKeys: readonly string[], now: number): Promise<Array<{ userId: string; billKey: string; at: number }>> {
  if (!billKeys.length) return [];
  const juris = new Map<string, Jurisdiction>((await inChunks(billKeys, c => db.select().from(billJurisdictions).where(inArray(billJurisdictions.billKey, c)))).map(j => [j.billKey, { code: j.jurisdiction, level: j.level as "federal" | "state" }]));
  const rows = await inChunks(billKeys, c => db.select({ userId: voiceVotes.userId, billKey: voiceVotes.billKey, at: voiceVotes.updatedAt, answer: voiceVotes.answer, counts: voiceVotes.counts, accountId: voiceVotes.accountId,
    accountCreatedAt: sql<number | null>`(select a.created_at from reader_accounts a where a.id = ${voiceVotes.accountId})`,
    emailVerifiedAt: sql<number | null>`(select a.verified_at from reader_accounts a where a.id = ${voiceVotes.accountId})`,
    phoneVerifiedAt: sql<number | null>`(select p.phone_verified_at from verification_profiles p where p.account_id = ${voiceVotes.accountId} and p.phone_hash is not null)`,
    hasHome: sql<number>`exists (select 1 from account_residences r where r.account_id = ${voiceVotes.accountId})`,
    mailVerified: sql<number>`exists (select 1 from mail_verifications m join account_residences r on r.account_id = m.account_id and r.address_key = m.address_key where m.account_id = ${voiceVotes.accountId} and m.revoked_at is null)`,
    quarantined: sql<number>`exists (select 1 from flagged_positions fp join integrity_flags f on f.id = fp.flag_id where fp.user_id = ${voiceVotes.userId} and fp.bill_id = ${voiceVotes.billKey} and f.status in ('open', 'confirmed'))`,
    held: sql<number>`exists (select 1 from account_holds h where h.account_id = ${voiceVotes.accountId} and h.status in ('open', 'confirmed'))`,
    congressional: positionResidences.congressional, state: positionResidences.stateCode, stateUpper: positionResidences.stateUpper, stateLower: positionResidences.stateLower })
    .from(voiceVotes).innerJoin(positionResidences, and(eq(positionResidences.userId, voiceVotes.userId), eq(positionResidences.billId, voiceVotes.billKey)))
    .where(and(inArray(voiceVotes.billKey, c), or(eq(positionResidences.stateCode, scope), eq(positionResidences.congressional, scope), eq(positionResidences.stateUpper, scope), eq(positionResidences.stateLower, scope)))));
  return rows.filter(r => {
    const j = juris.get(r.billKey);
    if (!j) return false;
    const c = voteCounts({ answer: r.answer as Answer, consent: r.counts === 1, accountCreatedAt: r.accountCreatedAt === null ? null : Number(r.accountCreatedAt),
      tier: tierOf(r.accountId ? { emailVerifiedAt: r.emailVerifiedAt, phoneVerifiedAt: r.phoneVerifiedAt, hasHome: Number(r.hasHome) === 1, mailVerified: Number(r.mailVerified) === 1 } : null),
      home: { congressional: r.congressional, state: r.state, stateUpper: r.stateUpper, stateLower: r.stateLower }, quarantined: Number(r.quarantined) === 1, held: Number(r.held) === 1 }, j, now);
    return c.counts && c.scopes.includes(scope);
  }).map(r => ({ userId: r.userId, billKey: r.billKey, at: Number(r.at) }));
}

/** The issue each bill is filed under: the site's issue list for a bill in Congress, the Legislature's own subjects for a state bill. */
async function issuesOf(db: Db, m: OfficeMember, billKeys: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(), add = (billKey: string, name: string) => out.set(billKey, [...(out.get(billKey) ?? []), name]);
  if (m.level === "federal") for (const r of await inChunks(billKeys, c => db.select({ billId: billCategories.billId, name: issueCategories.name }).from(billCategories)
    .innerJoin(issueCategories, eq(issueCategories.slug, billCategories.categorySlug)).where(inArray(billCategories.billId, c)))) add(r.billId, r.name);
  else for (const r of await inChunks(billKeys, c => db.select({ id: txBills.id, subjects: txBills.subjects }).from(txBills).where(inArray(txBills.id, c))))
    for (const s of unique(((r.subjects as unknown[] | null) ?? []).filter((x): x is string => typeof x === "string" && !!x.trim()).map(x => x.trim()))) add(r.id, s);
  return out;
}

/**
 * Everything an office may see, for one member: bills coming up, bills the member voted on lately and other bills with
 * a total, each with the total for the member's own scope and the member's recorded vote; the weekly trend; the top
 * issues. Every total is the result of `shownTotals`: below 25 counted voters the model holds a message and no number,
 * and the trend and the issues count only bills that have a total. Another member's scope is never read.
 */
export async function officeDashboard(db: Db, m: OfficeMember, now: number): Promise<OfficeDashboard> {
  const [coming, voted, withTotals] = await Promise.all([upcomingFor(db, m, now), memberVotes(db, m, { since: now - RECENT_VOTE_DAYS * DAY }), billsWithTotals(db, m.scope, 200)]);
  const info = await billInfo(db, m, unique([...coming.map(c => c.billKey), ...voted.keys(), ...withTotals]));
  const known = [...info.keys()];
  const [totals, votes, settled] = await Promise.all([totalsForScope(db, m.scope, known), memberVotes(db, m, { billKeys: known }), settledOf(known, now, db)]);
  const bill = (billKey: string, why: string): OfficeBill => ({ billKey, ...info.get(billKey)!, why, total: shownTotals(totals.get(billKey), m.scopeKind), memberVote: votes.get(billKey) ?? null, settled: settled.get(billKey) ?? null });
  // Each bill is listed once, in the first list it belongs to; a list holds at most LIST_MAX bills.
  const seen = new Set<string>();
  const take = (rows: ReadonlyArray<{ billKey: string; why: string }>, keep: (b: OfficeBill) => boolean = () => true) => {
    const out: OfficeBill[] = [];
    for (const r of rows) {
      if (out.length >= LIST_MAX) break;
      if (!info.has(r.billKey) || seen.has(r.billKey)) continue;
      const b = bill(r.billKey, r.why);
      if (keep(b)) { seen.add(r.billKey); out.push(b); }
    }
    return out;
  };
  // Owner, 20 Nov 2026: settled-bill opinion has its own section and is never merged with pending-bill opinion. A
  // settled bill is taken out of the three pending lists and listed under laws, or under bills that did not become law.
  const pending = (b: OfficeBill) => !b.settled;
  const votedRows = [...voted].map(([billKey, v]) => ({ billKey, why: `The member voted on ${longDate(v.date)}.` }));
  const answeredRows = withTotals.map(billKey => ({ billKey, why: `Residents of ${m.scopeName} have answered this bill.` }));
  const upcoming = take(coming, pending);
  const recent = take(votedRows, pending);
  const other = take(answeredRows, b => pending(b) && b.total.show);
  const settledRows = [...votedRows, ...answeredRows];
  const laws = take(settledRows, b => b.settled === "law" && (b.total.show || votedRows.some(r => r.billKey === b.billKey)));
  const notLaw = take(settledRows, b => b.settled === "not_law" && (b.total.show || votedRows.some(r => r.billKey === b.billKey)));

  // The trend and the issues count pending bills only, so no number on the page adds the two kinds together.
  const shownKeys = [...upcoming, ...recent, ...other].filter(b => b.total.show).map(b => b.billKey);
  const counted = await countedInScope(db, m.scope, shownKeys, now);
  const weeks = trendWeeks(now), byWeek = new Map<string, Set<string>>(weeks.map(w => [w, new Set<string>()]));
  for (const c of counted) byWeek.get(weekStart(c.at))?.add(c.userId);
  const trend: TrendWeek[] = shownKeys.length ? weeks.map(week => ({ week, voters: weekVoters(byWeek.get(week)!.size) })) : [];

  const filed = await issuesOf(db, m, shownKeys), byIssue = new Map<string, { voters: Set<string>; bills: Set<string> }>();
  for (const c of counted) for (const name of filed.get(c.billKey) ?? []) {
    const i = byIssue.get(name) ?? { voters: new Set<string>(), bills: new Set<string>() };
    i.voters.add(c.userId); i.bills.add(c.billKey); byIssue.set(name, i);
  }
  const issues: TopIssue[] = [...byIssue].map(([name, i]) => ({ name, voters: i.voters.size, bills: i.bills.size }))
    .sort((a, b) => b.voters - a.voters || a.name.localeCompare(b.name)).slice(0, TOP_ISSUES);
  return { member: m, asOf: now, upcoming, recent, other, trend, issues, laws, notLaw };
}

/* ───────────────────────────── The weekly email ───────────────────────────── */

export type OfficeEmailRun = { enabled: boolean; week: string; due: number; sent: number; failed: number;
  /** Not sent because no bill in the email had a total. */ nothingToShow: number;
  /** Not sent because answers on a bill in the email are under review. */ held: number;
  /** Not sent because the member no longer holds the seat. */ memberGone: number;
  /** Left for the next run by the cap on emails per run. */ overCap: number };
export type OfficeEmailDeps = { enabled: boolean; now: number; maxPerRun: number;
  send: (to: string, subject: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  links: (accountId: string) => Promise<{ dashboard: string; optOut: string }> };

/** Is any answer on these bills set aside by a flag the editor has not decided yet? */
async function underReview(db: Db, billKeys: readonly string[]): Promise<boolean> {
  if (!billKeys.length) return false;
  const hit = await inChunks(billKeys, c => db.select({ id: integrityFlags.id }).from(flaggedPositions).innerJoin(integrityFlags, eq(integrityFlags.id, flaggedPositions.flagId))
    .where(and(eq(integrityFlags.status, "open"), inArray(flaggedPositions.billId, c))).limit(1));
  return hit.length > 0;
}

/**
 * The weekly email, once a week per office account. Does nothing at all unless `enabled` (OFFICE_EMAIL_ENABLED=1).
 * Goes only to an active account that left the email on, only when at least one bill in it has a total, and never
 * while answers on one of its bills are under review. Each attempt is recorded in office_email_sends; a failed attempt
 * is tried again on a later run in the same week, a successful one is not repeated.
 */
export async function sendOfficeEmails(db: Db, deps: OfficeEmailDeps): Promise<OfficeEmailRun> {
  const week = weekStart(deps.now), run: OfficeEmailRun = { enabled: deps.enabled, week, due: 0, sent: 0, failed: 0, nothingToShow: 0, held: 0, memberGone: 0, overCap: 0 };
  if (!deps.enabled) return run;
  const accounts = await db.select().from(officeAccounts).where(and(eq(officeAccounts.status, "active"), eq(officeAccounts.weeklyEmail, 1), sql`${officeAccounts.emailVerifiedAt} is not null`)).orderBy(asc(officeAccounts.createdAt));
  const done = new Set((await db.select({ id: officeEmailSends.officeAccountId }).from(officeEmailSends).where(and(eq(officeEmailSends.week, week), eq(officeEmailSends.ok, 1)))).map(r => r.id));
  const boards = new Map<string, OfficeDashboard | null>();
  for (const a of accounts.filter(x => !done.has(x.id))) {
    run.due++;
    if (!boards.has(a.memberKey)) { const m = await memberOf(db, a.memberKey); boards.set(a.memberKey, m && m.current ? await officeDashboard(db, m, deps.now) : null); }
    const board = boards.get(a.memberKey);
    if (!board) { run.memberGone++; continue; }
    const email = composeOfficeEmail(board, await deps.links(a.id));
    if (!email.items) { run.nothingToShow++; continue; }
    if (await underReview(db, email.billKeys)) { run.held++; continue; }
    if (run.sent + run.failed >= deps.maxPerRun) { run.overCap++; continue; }
    const result = await deps.send(a.email, email.subject, email.text).catch(error => ({ ok: false, error: error instanceof Error ? error.message : "send failed" }));
    const row = { sentAt: deps.now, items: email.items, ok: result.ok ? 1 : 0, error: result.ok ? null : (result.error ?? "send failed").slice(0, 200) };
    await db.insert(officeEmailSends).values({ id: crypto.randomUUID(), officeAccountId: a.id, week, ...row }).onConflictDoUpdate({ target: [officeEmailSends.officeAccountId, officeEmailSends.week], set: row });
    if (result.ok) run.sent++; else run.failed++;
  }
  return run;
}
