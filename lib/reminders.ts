import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialFloorSchedule, readerAccounts, reminders, txBills, txCommittees, txEvents } from "@/db/schema";
import { weekOf } from "@/lib/federal/depth-parse";
import { congressGovPage } from "@/lib/federal/parse";
import { upcomingMeetings } from "@/lib/federal/meetings";
import { billIdLabel, meetingKindLine, meetingStatusNote } from "@/lib/federal/meetings-parse";
import { remindAtFor, txCommitteeFor, whenLabel, type ComingKind } from "@/lib/coming-rules";
import { sendTo } from "@/lib/mailer";
import { BRAND } from "@/lib/brand";

/**
 * Round H "What's coming": federal floor schedules and Texas hearings, with a
 * "remind me" that sends one email before the item (from the next scheduled
 * run: the Monday of a floor week, the day before a hearing). The test-ready
 * build adds committee hearings and markups in Congress (lib/federal/meetings.ts).
 */
export type ComingItem = { key: string; when: string; whenMs: number; title: string; detail: string; href: string; where: "Congress" | "Texas";
  /** "floor": on a chamber's floor schedule. "hearing": a committee hearing, markup or meeting. */
  kind: ComingKind; chamber?: string | null;
  // Hearings only. `title` is the official title, unchanged; `committee` and `meetingKind` are the plain-words lines above it.
  committee?: string | null; committeeCodes?: string[]; txCommitteeId?: string | null; meetingKind?: string; status?: string | null; place?: string | null;
  bills?: Array<{ label: string; href: string | null }>; sourceUrl?: string | null };
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

export async function comingItems(now = Date.now()): Promise<ComingItem[]> {
  const db = getDb(), today = new Date(now).toISOString().slice(0, 10);
  const [floor, events, meetings, txComms] = await Promise.all([
    db.select({ chamber: officialFloorSchedule.chamber, weekOf: officialFloorSchedule.weekOf, label: officialFloorSchedule.label, billId: officialFloorSchedule.billId, description: officialFloorSchedule.description, title: officialBills.title })
      .from(officialFloorSchedule).leftJoin(officialBills, eq(officialBills.id, officialFloorSchedule.billId)).where(gte(officialFloorSchedule.weekOf, weekOf(now))).limit(80),
    db.select().from(txEvents).where(gte(txEvents.start, today)).orderBy(asc(txEvents.start)).limit(40).catch(() => []),
    upcomingMeetings(now).catch(() => []),
    db.select().from(txCommittees).catch(() => []),
  ]);
  // Bills named by a hearing link to our own page when we hold the bill, else to the official page.
  const named = [...new Set(meetings.flatMap(m => m.billIds ?? []))], txNamed = [...new Set(events.flatMap(e => (e.bills as string[] | null) ?? []))];
  const [ours, txOurs] = await Promise.all([
    named.length ? db.select({ id: officialBills.id }).from(officialBills).where(inArray(officialBills.id, named.slice(0, 400))).catch(() => []) : [],
    txNamed.length ? db.select({ id: txBills.id, identifier: txBills.identifier, session: txBills.session }).from(txBills).where(inArray(txBills.identifier, txNamed.slice(0, 400))).orderBy(desc(txBills.session)).catch(() => []) : [],
  ]);
  const held = new Set(ours.map(b => b.id));
  const officialBillPage = (id: string) => { const m = id.match(/^(\d+)-([a-z]+)-(\d+)$/); return m ? congressGovPage({ id, congress: Number(m[1]), billType: m[2], number: Number(m[3]) }) : null; };
  const monday = (w: string) => Date.UTC(Number(w.slice(0, 4)), Number(w.slice(4, 6)) - 1, Number(w.slice(6, 8)), 14);
  return [...floor.map(f => ({ key: `floor:${f.chamber}:${f.weekOf}:${f.label}`, when: `Week of ${new Date(monday(f.weekOf)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`, whenMs: monday(f.weekOf),
      title: `${f.label}: ${f.title ?? f.description ?? ""}`.trim(), detail: `${f.chamber === "senate" ? "Senate" : "House"} floor schedule`, href: f.billId ? `/bills/${f.billId}` : "/coming", where: "Congress" as const,
      kind: "floor" as const, chamber: f.chamber })),
    ...meetings.map(m => ({ key: `meeting:${m.id}`, when: whenLabel(m.startsAt, "Congress"), whenMs: Date.parse(m.startsAt), title: m.title, detail: meetingKindLine(m.meetingType), href: "/coming?show=all#hearings", where: "Congress" as const,
      kind: "hearing" as const, chamber: m.chamber, committee: m.committeeName, committeeCodes: (m.committeeCode ?? "").split(",").filter(Boolean), meetingKind: meetingKindLine(m.meetingType), status: meetingStatusNote(m.status),
      place: m.location, bills: (m.billIds ?? []).slice(0, 12).map(id => ({ label: billIdLabel(id), href: held.has(id) ? `/bills/${id}` : officialBillPage(id) })), sourceUrl: m.url })),
    ...events.map(e => ({ key: `tx:${e.id}`, when: whenLabel(e.start, "Texas"),
      whenMs: Date.parse(e.start), title: e.name, detail: `Texas hearing${e.location ? ` · ${e.location}` : ""}${(e.bills as string[] | null)?.length ? ` · ${(e.bills as string[]).slice(0, 5).join(", ")}` : ""}`, href: "/texas", where: "Texas" as const,
      kind: "hearing" as const, committee: null, txCommitteeId: txCommitteeFor(e.name, txComms), meetingKind: "", status: null, place: e.location,
      bills: ((e.bills as string[] | null) ?? []).slice(0, 12).map(label => { const b = txOurs.find(x => x.identifier === label); return { label, href: b ? `/texas/bills/${encodeURIComponent(b.id)}` : null }; }), sourceUrl: e.url }))]
    .filter(i => Number.isFinite(i.whenMs)).sort((a, b) => a.whenMs - b.whenMs);
}

export async function setReminder(userId: string, item: ComingItem, on: boolean) {
  const db = getDb();
  if (!on) { await db.delete(reminders).where(and(eq(reminders.userId, userId), eq(reminders.itemKey, item.key))); return; }
  const title = item.kind === "hearing" && item.committee ? `${item.committee}: ${item.title}` : item.title;
  await db.insert(reminders).values({ userId, itemKey: item.key, title: title.slice(0, 200), url: item.href, remindAt: remindAtFor(item), createdAt: Date.now() }).onConflictDoNothing();
}
export async function remindersOf(userId: string | null) {
  if (!userId) return new Set<string>();
  return new Set((await getDb().select({ k: reminders.itemKey }).from(reminders).where(eq(reminders.userId, userId))).map(r => r.k));
}

/** Each scheduled run: email reminders that are due, once. */
export async function sendDueReminders(now = Date.now()) {
  const db = getDb();
  const due = await db.select({ userId: reminders.userId, itemKey: reminders.itemKey, title: reminders.title, url: reminders.url, email: readerAccounts.email, verifiedAt: readerAccounts.verifiedAt })
    .from(reminders).leftJoin(readerAccounts, eq(readerAccounts.appUserId, reminders.userId)).where(and(lte(reminders.remindAt, now), isNull(reminders.sentAt))).limit(200);
  let sent = 0, skipped = 0;
  for (const r of due) {
    if (r.email && r.verifiedAt) { const res = await sendTo(r.email, `Coming up: ${r.title.slice(0, 80)}`, [`You asked ${BRAND.name} to remind you.`, "", r.title, "", `${SITE}${r.url}`, "", "One reminder per item. Manage them on the What's coming page."].join("\n")); if (res.ok) sent++; else continue; }
    else skipped++;
    await db.update(reminders).set({ sentAt: now }).where(and(eq(reminders.userId, r.userId), eq(reminders.itemKey, r.itemKey)));
  }
  return { due: due.length, sent, skipped };
}
