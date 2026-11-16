import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { digestSends, officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, readerAccounts, userFollows } from "@/db/schema";
import { billLabel, memberLine } from "@/components/federal/badges";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { formatDigest, isoWeek, type DigestMember } from "@/lib/digest-format";
import { sendTo } from "@/lib/mailer";
import { unsubscribeToken } from "@/lib/accounts";
import { countEvent } from "@/lib/events";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";
const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Monday's email for every signed-in reader who follows someone and has not opted out. One per reader per week. */
export async function runDigests(now = Date.now()) {
  const db = getDb(), week = isoWeek(now);
  const accounts = await db.select().from(readerAccounts).where(and(isNotNull(readerAccounts.verifiedAt), eq(readerAccounts.digestOptIn, 1)));
  const out = { accounts: accounts.length, sent: 0, empty: 0, failed: 0, domainNeeded: false };
  for (const a of accounts) {
    if (await db.select({ id: digestSends.id }).from(digestSends).where(and(eq(digestSends.accountId, a.id), eq(digestSends.week, week))).get()) continue;
    const follows = (await db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, a.appUserId))).map(r => r.id);
    if (!follows.length) { out.empty++; continue; }
    const since = Math.max(a.lastDigestAt ?? 0, now - WEEK_MS);
    const rows = await db.select({ pid: officialMemberVotes.politicianId, position: officialMemberVotes.position, rc: officialRollCalls, billTitle: officialBills.title,
      billType: officialBills.billType, number: officialBills.number,
      headline: sql<string | null>`(select s.headline from analysis_bill_summaries s where s.bill_id = ${officialRollCalls.billId} and s.status = 'visible' order by s.created_at desc limit 1)` })
      .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId))
      .where(and(inArray(officialMemberVotes.politicianId, follows), gte(officialRollCalls.votedAt, since))).orderBy(desc(officialRollCalls.votedAt)).limit(200);
    const people = await db.select().from(officialPoliticians).where(inArray(officialPoliticians.id, follows));
    const members: DigestMember[] = people.map(p => ({ name: p.fullName, seat: memberLine(p), votes: rows.filter(r => r.pid === p.id).map(r => {
      const kind = voteKind(r.rc.question, r.billTitle ?? r.rc.title);
      return { date: new Date(r.rc.votedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }), kindLabel: KIND_LABEL[kind],
        voteText: positionLine(r.position, kind), billLabel: r.billType && r.number ? billLabel(r.billType, r.number) : (r.rc.documentLabel ?? "Recorded vote"),
        billTitle: r.billTitle ?? r.rc.title ?? r.rc.question, headline: r.headline, sourceUrl: r.rc.sourceUrl, billUrl: r.rc.billId ? `${SITE_URL}/bills/${r.rc.billId}` : null };
    }) }));
    const mail = formatDigest(members, { site: SITE_URL, unsubscribe: `${SITE_URL}/account/unsubscribe?t=${encodeURIComponent(await unsubscribeToken(a.id))}` });
    if (!mail) { out.empty++; continue; }
    const sent = await sendTo(a.email, mail.subject, mail.text);
    await db.insert(digestSends).values({ id: crypto.randomUUID(), accountId: a.id, week, sentAt: now, items: mail.items, ok: sent.ok ? 1 : 0, error: sent.ok ? null : sent.error })
      .onConflictDoNothing();
    if (sent.ok) { out.sent++; await db.update(readerAccounts).set({ lastDigestAt: now }).where(eq(readerAccounts.id, a.id)); }
    else { out.failed++; if (sent.domainNeeded) out.domainNeeded = true; }
  }
  if (out.sent) await countEvent("digest_sent", "", { skipBotCheck: true }).catch(() => undefined);
  return out;
}

export async function digestCounts() {
  const row = await getDb().select({ sent: sql<number>`sum(case when ok = 1 then 1 else 0 end)`, failed: sql<number>`sum(case when ok = 0 then 1 else 0 end)` }).from(digestSends).get();
  const accounts = await getDb().select({ n: sql<number>`count(*)`, optIn: sql<number>`sum(digest_opt_in)` }).from(readerAccounts).where(isNotNull(readerAccounts.verifiedAt)).get();
  return { readerAccounts: Number(accounts?.n ?? 0), digestOptIn: Number(accounts?.optIn ?? 0), digestsSent: Number(row?.sent ?? 0), digestsFailed: Number(row?.failed ?? 0) };
}
