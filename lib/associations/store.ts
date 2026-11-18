/**
 * Associations: the database side of lib/associations/rules.ts. Every function takes the database handle and reads no
 * request and no secret (hashes of the join code and of an administrator's email arrive already made), so
 * tests/associations.test.mjs runs these same functions against a temporary database built from the real migrations.
 *
 * Nothing here returns a member: not a name, an email, an account id, a single answer or a reason. What leaves this
 * file about members is a count (only from 25) and per-bill totals (only from 25 counted member voters).
 */
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { accessLinks, associationAdmins, associationMembers, associations, billJurisdictions, officialBills, positionResidences, txBills, voiceVotes } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import { jurisdictionOf } from "../constituent/store.ts";
import { MIN_SHOWN, tierOf, type Answer, type Jurisdiction, type ScopeTotals, type VoteFacts } from "../constituent/rules.ts";
import { ASSOC_LINK_TTL_MS, canMove, federalLabel, freeSlug, slugFor, tallyMembers, viewRows, type AssociationStatus, type BillLabel, type ViewRow } from "./rules.ts";

/* ───────────────────────────── The editor: associations and their administrators ───────────────────────────── */

/** A new association, not open yet. Only the keyed hash of its join code is stored; the code itself never reaches this file. */
export async function createAssociation(db: Db, i: { name: string; joinCodeHash: string; now: number }): Promise<{ id: string; slug: string }> {
  const base = slugFor(i.name);
  const taken = new Set((await db.select({ slug: associations.slug }).from(associations).where(or(eq(associations.slug, base), sql`${associations.slug} like ${`${base}-%`}`))).map(r => r.slug));
  const id = crypto.randomUUID(), slug = freeSlug(base, taken);
  await db.insert(associations).values({ id, name: i.name, slug, joinCodeHash: i.joinCodeHash, status: "pending", createdAt: i.now });
  return { id, slug };
}

/** A new join code replaces the old one, which stops working at once. Members who already joined stay. Not for a closed association. */
export async function replaceJoinCode(db: Db, associationId: string, joinCodeHash: string): Promise<boolean> {
  return (await db.update(associations).set({ joinCodeHash }).where(and(eq(associations.id, associationId), inArray(associations.status, ["pending", "active"]))).returning({ id: associations.id })).length > 0;
}

/**
 * Opens or closes an association (lib/associations/rules.ts `canMove`). Closing removes every membership and every
 * unused sign-in link, so a closed association holds nothing about a reader.
 */
export async function setAssociationStatus(db: Db, associationId: string, to: AssociationStatus, now: number): Promise<boolean> {
  const a = await db.select({ status: associations.status }).from(associations).where(eq(associations.id, associationId)).get();
  if (!a || !canMove(a.status as AssociationStatus, to)) return false;
  await db.update(associations).set({ status: to, decidedAt: now }).where(eq(associations.id, associationId));
  if (to === "closed") {
    await db.delete(associationMembers).where(eq(associationMembers.associationId, associationId));
    const admins = await db.select({ id: associationAdmins.id }).from(associationAdmins).where(eq(associationAdmins.associationId, associationId));
    if (admins.length) await db.delete(accessLinks).where(and(eq(accessLinks.kind, "association"), inArray(accessLinks.subjectId, admins.map(x => x.id))));
  }
  return true;
}

/** Adds an administrator's address. False when that address is already on this association's list or the association is closed. */
export async function addAdmin(db: Db, i: { associationId: string; email: string; emailHash: string; now: number }): Promise<boolean> {
  const a = await db.select({ status: associations.status }).from(associations).where(eq(associations.id, i.associationId)).get();
  if (!a || a.status === "closed") return false;
  return (await db.insert(associationAdmins).values({ id: crypto.randomUUID(), associationId: i.associationId, email: i.email, emailHash: i.emailHash, status: "pending", createdAt: i.now })
    .onConflictDoNothing().returning({ id: associationAdmins.id })).length > 0;
}
/** Takes an administrator off the list: the row and its sign-in links are deleted, so the address is no longer stored and any open session stops on its next request. */
export async function removeAdmin(db: Db, adminId: string): Promise<void> {
  await db.delete(accessLinks).where(and(eq(accessLinks.kind, "association"), eq(accessLinks.subjectId, adminId)));
  await db.delete(associationAdmins).where(eq(associationAdmins.id, adminId));
}

/** How many members, or null below 25. The number itself is never returned below 25, to the editor or to anyone. */
export async function memberCountShown(db: Db, associationId: string): Promise<number | null> {
  const n = Number((await db.select({ n: sql<number>`count(*)` }).from(associationMembers).where(eq(associationMembers.associationId, associationId)).get())?.n ?? 0);
  return n >= MIN_SHOWN ? n : null;
}

/** The editor's list: each association, its administrators' addresses (the editor typed them), and the member count from 25. No member. */
export async function associationsForEditor(db: Db) {
  const [rows, admins] = await Promise.all([db.select({ id: associations.id, name: associations.name, slug: associations.slug, status: associations.status, createdAt: associations.createdAt, decidedAt: associations.decidedAt })
    .from(associations).orderBy(sql`${associations.createdAt} desc`),
    db.select({ id: associationAdmins.id, associationId: associationAdmins.associationId, email: associationAdmins.email, status: associationAdmins.status, verifiedAt: associationAdmins.verifiedAt }).from(associationAdmins).orderBy(associationAdmins.createdAt)]);
  return Promise.all(rows.map(async a => ({ ...a, status: a.status as AssociationStatus, members: await memberCountShown(db, a.id), admins: admins.filter(x => x.associationId === a.id) })));
}

/* ───────────────────────────── Members: join, leave, see their own memberships ───────────────────────────── */

export type JoinResult = { ok: true; name: string; already: boolean } | { ok: false; why: "no_match" | "not_open" };
/** A reader account joins the association whose code hash this is. Only an open association takes members. */
export async function joinAssociation(db: Db, i: { accountId: string; joinCodeHash: string; now: number }): Promise<JoinResult> {
  const a = await db.select({ id: associations.id, name: associations.name, status: associations.status }).from(associations).where(eq(associations.joinCodeHash, i.joinCodeHash)).get();
  if (!a) return { ok: false, why: "no_match" };
  if (a.status !== "active") return { ok: false, why: "not_open" };
  const added = await db.insert(associationMembers).values({ associationId: a.id, accountId: i.accountId, joinedAt: i.now }).onConflictDoNothing().returning({ id: associationMembers.associationId });
  return { ok: true, name: a.name, already: added.length === 0 };
}
/** One tap: the membership row is deleted. Returns the association's name when there was a row to delete. */
export async function leaveAssociation(db: Db, i: { accountId: string; associationId: string }): Promise<string | null> {
  const gone = await db.delete(associationMembers).where(and(eq(associationMembers.accountId, i.accountId), eq(associationMembers.associationId, i.associationId))).returning({ id: associationMembers.associationId });
  if (!gone.length) return null;
  return (await db.select({ name: associations.name }).from(associations).where(eq(associations.id, i.associationId)).get())?.name ?? null;
}
/** The associations one reader is in, for that reader's own Account page. */
export async function membershipsOf(db: Db, accountId: string): Promise<Array<{ id: string; name: string; joinedAt: number }>> {
  return db.select({ id: associations.id, name: associations.name, joinedAt: associationMembers.joinedAt }).from(associationMembers)
    .innerJoin(associations, eq(associations.id, associationMembers.associationId)).where(eq(associationMembers.accountId, accountId)).orderBy(associationMembers.joinedAt);
}

/* ───────────────────────────── An administrator's single-use sign-in link ───────────────────────────── */

/** The administrator rows an address may sign in as: not revoked, in an association that is open. Empty for any other address. */
export async function adminsForEmail(db: Db, emailHash: string): Promise<Array<{ adminId: string; email: string; associationName: string }>> {
  return db.select({ adminId: associationAdmins.id, email: associationAdmins.email, associationName: associations.name }).from(associationAdmins)
    .innerJoin(associations, eq(associations.id, associationAdmins.associationId))
    .where(and(eq(associationAdmins.emailHash, emailHash), inArray(associationAdmins.status, ["pending", "active"]), eq(associations.status, "active")));
}
/** A new link for one administrator row, good for 30 minutes. That row's used and expired links are cleared first, so they do not pile up. */
export async function issueAccessLink(db: Db, adminId: string, now: number): Promise<string> {
  await db.delete(accessLinks).where(and(eq(accessLinks.kind, "association"), eq(accessLinks.subjectId, adminId), or(lt(accessLinks.expiresAt, now), sql`${accessLinks.usedAt} is not null`)));
  const nonce = crypto.randomUUID();
  await db.insert(accessLinks).values({ nonce, kind: "association", subjectId: adminId, createdAt: now, expiresAt: now + ASSOC_LINK_TTL_MS });
  return nonce;
}
/**
 * Uses a link once. It is marked used in the same statement that checks it, so two taps cannot both get in. Returns the
 * administrator row it was made for, or null: unknown, used, expired, made for an office, the administrator was taken
 * off the list, or the association is not open.
 */
export async function redeemAccessLink(db: Db, nonce: string, now: number): Promise<string | null> {
  const used = await db.update(accessLinks).set({ usedAt: now }).where(and(eq(accessLinks.nonce, nonce), eq(accessLinks.kind, "association"), isNull(accessLinks.usedAt), gte(accessLinks.expiresAt, now)))
    .returning({ adminId: accessLinks.subjectId });
  if (!used.length) return null;
  const adminId = used[0].adminId;
  const row = await db.select({ status: associationAdmins.status, verifiedAt: associationAdmins.verifiedAt, open: associations.status }).from(associationAdmins)
    .innerJoin(associations, eq(associations.id, associationAdmins.associationId)).where(eq(associationAdmins.id, adminId)).get();
  if (!row || row.status === "revoked" || row.open !== "active") return null;
  await db.update(associationAdmins).set({ status: "active", verifiedAt: row.verifiedAt ?? now }).where(eq(associationAdmins.id, adminId));
  return adminId;
}
/** Checked on every request of a signed-in administrator: still on the list, has used a link, and the association is open. */
export async function adminSession(db: Db, adminId: string): Promise<{ adminId: string; associationId: string; associationName: string } | null> {
  const row = await db.select({ adminId: associationAdmins.id, associationId: associations.id, associationName: associations.name }).from(associationAdmins)
    .innerJoin(associations, eq(associations.id, associationAdmins.associationId))
    .where(and(eq(associationAdmins.id, adminId), eq(associationAdmins.status, "active"), eq(associations.status, "active"))).get();
  return row ?? null;
}

/* ───────────────────────────── Totals for an association's own members ───────────────────────────── */

/**
 * Every answer given by an account that is a member of this association, by bill, with the facts the counting rule
 * needs. This is the query of `voteFacts` in lib/constituent/store.ts (which reads one bill, everyone) restricted to
 * member accounts and read for all their bills at once; the facts and their meaning are the same, and
 * tests/associations.test.mjs checks the two against each other. One account is one voter on a bill: if an account has
 * answered the same bill from two devices, only its latest answer is read.
 */
export async function memberVoteFacts(db: Db, associationId: string): Promise<Map<string, VoteFacts[]>> {
  const rows = await db.select({ billKey: voiceVotes.billKey, answer: voiceVotes.answer, counts: voiceVotes.counts, accountId: voiceVotes.accountId, updatedAt: voiceVotes.updatedAt,
    accountCreatedAt: sql<number | null>`(select a.created_at from reader_accounts a where a.id = ${voiceVotes.accountId})`,
    emailVerifiedAt: sql<number | null>`(select a.verified_at from reader_accounts a where a.id = ${voiceVotes.accountId})`,
    phoneVerifiedAt: sql<number | null>`(select p.phone_verified_at from verification_profiles p where p.account_id = ${voiceVotes.accountId} and p.phone_hash is not null)`,
    hasHome: sql<number>`exists (select 1 from account_residences r where r.account_id = ${voiceVotes.accountId})`,
    mailVerified: sql<number>`exists (select 1 from mail_verifications m join account_residences r on r.account_id = m.account_id and r.address_key = m.address_key where m.account_id = ${voiceVotes.accountId} and m.revoked_at is null)`,
    quarantined: sql<number>`exists (select 1 from flagged_positions fp join integrity_flags f on f.id = fp.flag_id where fp.user_id = ${voiceVotes.userId} and fp.bill_id = ${voiceVotes.billKey} and f.status in ('open', 'confirmed'))`,
    held: sql<number>`exists (select 1 from account_holds h where h.account_id = ${voiceVotes.accountId} and h.status in ('open', 'confirmed'))`,
    congressional: positionResidences.congressional, state: positionResidences.stateCode, stateUpper: positionResidences.stateUpper, stateLower: positionResidences.stateLower })
    .from(voiceVotes)
    .innerJoin(associationMembers, and(eq(associationMembers.accountId, voiceVotes.accountId), eq(associationMembers.associationId, associationId)))
    .leftJoin(positionResidences, and(eq(positionResidences.userId, voiceVotes.userId), eq(positionResidences.billId, voiceVotes.billKey)))
    .orderBy(voiceVotes.updatedAt);
  const latest = new Map<string, (typeof rows)[number]>(); // "bill|account": a later answer by the same account replaces an earlier one
  for (const r of rows) latest.set(`${r.billKey}|${r.accountId}`, r);
  const out = new Map<string, VoteFacts[]>();
  for (const r of latest.values()) {
    const facts: VoteFacts = { answer: r.answer as Answer, consent: r.counts === 1,
      tier: tierOf({ emailVerifiedAt: r.emailVerifiedAt, phoneVerifiedAt: r.phoneVerifiedAt, hasHome: Number(r.hasHome) === 1, mailVerified: Number(r.mailVerified) === 1 }),
      accountCreatedAt: r.accountCreatedAt === null ? null : Number(r.accountCreatedAt), quarantined: Number(r.quarantined) === 1, held: Number(r.held) === 1,
      home: r.congressional && r.state ? { congressional: r.congressional, state: r.state, stateUpper: r.stateUpper, stateLower: r.stateLower } : null };
    out.set(r.billKey, [...(out.get(r.billKey) ?? []), facts]);
  }
  return out;
}

/** Each bill's jurisdiction, read in one query where it is already stored, and through `jurisdictionOf` where it is not. */
async function jurisdictionsOf(db: Db, billKeys: readonly string[], now: number): Promise<Map<string, Jurisdiction>> {
  const out = new Map<string, Jurisdiction>();
  for (let i = 0; i < billKeys.length; i += 200) for (const r of await db.select().from(billJurisdictions).where(inArray(billJurisdictions.billKey, billKeys.slice(i, i + 200))))
    out.set(r.billKey, { code: r.jurisdiction, level: r.level as "federal" | "state" });
  for (const k of billKeys) if (!out.has(k)) { const j = await jurisdictionOf(db, k, now); if (j) out.set(k, j); }
  return out;
}

/**
 * The member totals of every bill a member has answered, keyed by bill: counted members only, by the site's own rule
 * (`voteCounts`, through `tallyMembers`), each member once, in the mail-verified or the address-matched group. A bill
 * the site does not hold has no total. These are worked out when asked for and stored nowhere, so a member who leaves,
 * or whose account is deleted, is out of the next one.
 */
export async function memberTotals(db: Db, associationId: string, now = Date.now()): Promise<Map<string, ScopeTotals>> {
  const facts = await memberVoteFacts(db, associationId), js = await jurisdictionsOf(db, [...facts.keys()], now), out = new Map<string, ScopeTotals>();
  for (const [billKey, rows] of facts) { const j = js.get(billKey); if (j) out.set(billKey, tallyMembers(rows, j, now)); }
  return out;
}

/** The number, official title and official page of each bill: federal bills from official_bills, Texas bills from tx_bills. */
export async function billLabels(db: Db, billKeys: readonly string[]): Promise<Map<string, BillLabel>> {
  const out = new Map<string, BillLabel>();
  for (let i = 0; i < billKeys.length; i += 200) {
    const keys = billKeys.slice(i, i + 200);
    const [federal, texas] = await Promise.all([
      db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title, url: officialBills.congressUrl }).from(officialBills).where(inArray(officialBills.id, keys)),
      db.select({ id: txBills.id, identifier: txBills.identifier, title: txBills.title, url: txBills.tloUrl }).from(txBills).where(inArray(txBills.id, keys))]);
    for (const b of federal) out.set(b.id, { label: federalLabel(b.billType, b.number), title: b.title, url: b.url });
    for (const b of texas) out.set(b.id, { label: `Texas ${b.identifier}`, title: b.title, url: b.url });
  }
  return out;
}

export type AssociationView = { name: string; members: number | null; rows: ViewRow[] };
/**
 * Everything an administrator is shown, and the only way to it. The association is the one this administrator row
 * belongs to: no association is ever named by the request, so one association's administrator cannot ask for another's
 * totals. Null when the administrator is not signed in properly any more (taken off the list, or the association closed).
 */
export async function viewForAdmin(db: Db, adminId: string, now = Date.now()): Promise<AssociationView | null> {
  const s = await adminSession(db, adminId);
  if (!s) return null;
  const totals = await memberTotals(db, s.associationId, now);
  const shown = viewRows(totals, new Map());
  return { name: s.associationName, members: await memberCountShown(db, s.associationId), rows: viewRows(totals, await billLabels(db, shown.map(r => r.billKey))) };
}
