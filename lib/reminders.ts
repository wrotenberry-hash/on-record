import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialFloorSchedule, readerAccounts, reminders, txEvents } from "@/db/schema";
import { weekOf } from "@/lib/federal/depth-parse";
import { sendTo } from "@/lib/mailer";
import { BRAND } from "@/lib/brand";

/**
 * Round H "What's coming": federal floor schedules and Texas hearings, with a
 * "remind me" that sends one email before the item (from the next scheduled
 * run: the Monday of a floor week, the day before a hearing).
 */
export type ComingItem = { key: string; when: string; whenMs: number; title: string; detail: string; href: string; where: "Congress" | "Texas" };
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

export async function comingItems(now = Date.now()): Promise<ComingItem[]> {
  const db = getDb(), today = new Date(now).toISOString().slice(0, 10);
  const [floor, events] = await Promise.all([
    db.select({ chamber: officialFloorSchedule.chamber, weekOf: officialFloorSchedule.weekOf, label: officialFloorSchedule.label, billId: officialFloorSchedule.billId, description: officialFloorSchedule.description, title: officialBills.title })
      .from(officialFloorSchedule).leftJoin(officialBills, eq(officialBills.id, officialFloorSchedule.billId)).where(gte(officialFloorSchedule.weekOf, weekOf(now))).limit(80),
    db.select().from(txEvents).where(gte(txEvents.start, today)).orderBy(asc(txEvents.start)).limit(40).catch(() => []),
  ]);
  const monday = (w: string) => Date.UTC(Number(w.slice(0, 4)), Number(w.slice(4, 6)) - 1, Number(w.slice(6, 8)), 14);
  return [...floor.map(f => ({ key: `floor:${f.chamber}:${f.weekOf}:${f.label}`, when: `Week of ${new Date(monday(f.weekOf)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`, whenMs: monday(f.weekOf),
      title: `${f.label}: ${f.title ?? f.description ?? ""}`.trim(), detail: `${f.chamber === "senate" ? "Senate" : "House"} floor schedule`, href: f.billId ? `/bills/${f.billId}` : "/coming", where: "Congress" as const })),
    ...events.map(e => ({ key: `tx:${e.id}`, when: new Date(e.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) + " CT",
      whenMs: Date.parse(e.start), title: e.name, detail: `Texas hearing${e.location ? ` · ${e.location}` : ""}${(e.bills as string[] | null)?.length ? ` · ${(e.bills as string[]).slice(0, 5).join(", ")}` : ""}`, href: "/texas", where: "Texas" as const }))]
    .sort((a, b) => a.whenMs - b.whenMs);
}

export async function setReminder(userId: string, item: ComingItem, on: boolean) {
  const db = getDb();
  if (!on) { await db.delete(reminders).where(and(eq(reminders.userId, userId), eq(reminders.itemKey, item.key))); return; }
  const remindAt = item.where === "Texas" ? item.whenMs - 86400e3 : item.whenMs - 3600e3;
  await db.insert(reminders).values({ userId, itemKey: item.key, title: item.title.slice(0, 200), url: item.href, remindAt, createdAt: Date.now() }).onConflictDoNothing();
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
