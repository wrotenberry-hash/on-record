import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { alertPrefs, billCategories, issueCategories, officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, readerAccounts, readerIssues, readerLocations, userFollows } from "@/db/schema";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { federalLegislators } from "@/lib/federal/legislators";
import { positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { billLabel } from "@/components/federal/badges";
import { notifyUser } from "@/lib/push";
import { sendTo } from "@/lib/mailer";

/**
 * Round D optional instant alerts: after each federal update, a reader who turned
 * them on hears when one of their legislators (or a member they follow) votes on a
 * bill in one of their issues. One message per reader per run; email for readers
 * with a verified address, push on devices where they turned alerts on.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
export async function runInstantAlerts(now = Date.now()) {
  const db = getDb(), since = Number(await getCursor(db, "alerts:lastVotedAt") ?? now - 86400e3);
  const rolls = await db.select({ id: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, billId: officialRollCalls.billId,
    billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number }).from(officialRollCalls).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
    .where(gt(officialRollCalls.votedAt, since));
  if (!rolls.length) return { readers: 0, sent: 0 };
  await setCursor(db, "alerts:lastVotedAt", String(Math.max(...rolls.map(r => r.votedAt))));
  const users = await db.select({ userId: alertPrefs.userId }).from(alertPrefs).where(eq(alertPrefs.instantVotes, 1));
  const cats = await db.select({ billId: billCategories.billId, slug: billCategories.categorySlug, name: issueCategories.name }).from(billCategories).innerJoin(issueCategories, eq(issueCategories.slug, billCategories.categorySlug))
    .where(inArray(billCategories.billId, rolls.map(r => r.billId).filter((x): x is string => !!x).concat("-")));
  let sent = 0;
  for (const { userId } of users) {
    const [issues, follows, loc, account] = await Promise.all([db.select({ s: readerIssues.slug }).from(readerIssues).where(eq(readerIssues.userId, userId)),
      db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId)), db.select().from(readerLocations).where(eq(readerLocations.userId, userId)).get(),
      db.select().from(readerAccounts).where(eq(readerAccounts.appUserId, userId)).get()]);
    const fed = loc ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
    const members = [...new Set([...follows.map(f => f.id), ...(fed?.senators.map(s => s.id) ?? []), ...(fed?.representative ? [fed.representative.id] : [])])];
    const slugs = new Set(issues.map(i => i.s));
    if (!members.length || !slugs.size) continue;
    const relevant = rolls.filter(r => r.billId && cats.some(c => c.billId === r.billId && slugs.has(c.slug)));
    if (!relevant.length) continue;
    const votes = await db.select({ rollCallId: officialMemberVotes.rollCallId, position: officialMemberVotes.position, name: officialPoliticians.fullName })
      .from(officialMemberVotes).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
      .where(and(inArray(officialMemberVotes.rollCallId, relevant.map(r => r.id)), inArray(officialMemberVotes.politicianId, members)));
    if (!votes.length) continue;
    const lines = votes.slice(0, 6).map(v => { const r = relevant.find(x => x.id === v.rollCallId)!; return `${v.name}: ${positionLine(v.position, voteKind(r.question, r.billTitle ?? r.title)).toLowerCase()} on ${r.billType ? billLabel(r.billType, r.number!) : r.question}`; });
    const first = relevant.find(r => r.id === votes[0].rollCallId)!;
    await notifyUser(userId, { title: `${votes[0].name} voted on ${first.billType ? billLabel(first.billType, first.number!) : "a bill"}`, body: lines.join("; "), url: first.billId ? `/bills/${first.billId}` : "/" });
    if (account?.verifiedAt) await sendTo(account.email, "Your legislators just voted on your issues", [...lines, "", `${SITE}${first.billId ? `/bills/${first.billId}` : "/"}`, "", "Turn instant alerts off on your Account page."].join("\n"));
    sent++;
  }
  return { readers: users.length, sent };
}
