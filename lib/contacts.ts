import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { legislatorContacts } from "@/db/schema";
import { countEvent, eventTotals } from "@/lib/events";
import { requestContext, withinLimit } from "@/lib/verify/store";
import { CONTACT_EVENTS, contactEventAllowed } from "@/lib/contact-message";
import type { ParsedContact } from "@/lib/contact-parse";

/**
 * How to reach a legislator through official channels (table legislator_contacts,
 * test-ready build). Rows are copies of the official member files, stored with
 * their source and retrieval time by the federal and Texas ingests. The site
 * never sends anything: these feed a phone link, a link to the member's own
 * form and a mail link in the reader's own apps.
 */
type Db = ReturnType<typeof getDb>;
export type ContactKind = "federal" | "texas";
export type ContactRow = typeof legislatorContacts.$inferSelect;

/** Contact rows for the given members, keyed by member id. Members with nothing on record are simply absent. */
export async function contactsFor(kind: ContactKind, memberIds: string[]): Promise<Map<string, ContactRow>> {
  const ids = [...new Set(memberIds.filter(Boolean))], out = new Map<string, ContactRow>();
  for (let i = 0; i < ids.length; i += 90) {
    const rows = await getDb().select().from(legislatorContacts).where(and(eq(legislatorContacts.kind, kind), inArray(legislatorContacts.memberId, ids.slice(i, i + 90))));
    for (const r of rows) out.set(r.memberId, r);
  }
  return out;
}

/**
 * Stores one row per member. `keepDistrict` leaves district-office fields already on file untouched when this
 * run could not read them (the district-offices file did not answer), instead of blanking them.
 */
export async function upsertContacts(db: Db, kind: ContactKind, rows: ParsedContact[], sourceUrl: string, now: number, { keepDistrict = false }: { keepDistrict?: boolean } = {}) {
  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(legislatorContacts).values(rows.slice(i, i + 50).map(r => ({ id: `${kind}:${r.memberId}`, kind, memberId: r.memberId, phone: r.phone, contactFormUrl: r.contactFormUrl,
      officeAddress: r.officeAddress, districtPhone: r.districtPhone, districtAddress: r.districtAddress, email: r.email, websiteUrl: r.websiteUrl, sourceUrl, retrievedAt: now })))
      .onConflictDoUpdate({ target: legislatorContacts.id, set: { phone: sql`excluded.phone`, contactFormUrl: sql`excluded.contact_form_url`, officeAddress: sql`excluded.office_address`,
        ...(keepDistrict ? {} : { districtPhone: sql`excluded.district_phone`, districtAddress: sql`excluded.district_address` }),
        email: sql`excluded.email`, websiteUrl: sql`excluded.website_url`, sourceUrl: sql`excluded.source_url`, retrievedAt: sql`excluded.retrieved_at` } });
  }
  return rows.length;
}

/** Removes rows of this kind for members who are no longer on the official list. */
export async function dropContactsExcept(db: Db, kind: ContactKind, keepMemberIds: string[]) {
  const keep = new Set(keepMemberIds);
  const stale = (await db.select({ id: legislatorContacts.id, memberId: legislatorContacts.memberId }).from(legislatorContacts).where(eq(legislatorContacts.kind, kind))).filter(r => !keep.has(r.memberId)).map(r => r.id);
  for (let i = 0; i < stale.length; i += 90) await db.delete(legislatorContacts).where(inArray(legislatorContacts.id, stale.slice(i, i + 90)));
  return stale.length;
}

export async function hasContacts(db: Db, kind: ContactKind) {
  return !!(await db.select({ id: legislatorContacts.id }).from(legislatorContacts).where(eq(legislatorContacts.kind, kind)).limit(1).get());
}

/**
 * Counts one tap on the contact tool: which button and on which kind of page ("bill", "tx_bill", "member").
 * Never which member or which bill, and never the message. Rate-limited per device like share taps.
 */
export async function logContactTap(event: unknown, dim: unknown) {
  if (!contactEventAllowed(event, dim)) return false;
  const ctx = await requestContext();
  if (!(await withinLimit("share_device_hour", ctx.device ?? ctx.ipRange))) return false;
  await countEvent(event, dim as string);
  return true;
}

/** Contact taps over the last `days` days by button, for the editor's numbers and the health probe. Aggregate only. */
export async function contactTaps(days = 7) {
  const rows = await eventTotals(days, CONTACT_EVENTS);
  const sum = (name: string) => rows.filter(r => r.name === name).reduce((a, r) => a + r.n, 0);
  return { days, opened: sum("contact_open"), calls: sum("contact_call"), forms: sum("contact_form"), copies: sum("contact_copy"), emails: sum("contact_email"),
    byPage: Object.fromEntries(["bill", "tx_bill", "member"].map(d => [d, rows.filter(r => r.dim === d).reduce((a, r) => a + r.n, 0)])) };
}
