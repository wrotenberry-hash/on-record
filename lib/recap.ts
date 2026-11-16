import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialMemberVotes, officialPoliticians, officialRollCalls, userFollows } from "@/db/schema";
import { currentLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { KIND_LABEL, positionLine, voteKind } from "@/lib/federal/vote-kinds";
import { voteLine, type Card } from "@/lib/card-content";
import { billLabel } from "@/components/federal/badges";

/** Round D weekly recap: the reader's legislators' votes in the last 7 days, as a list and a shareable card. Record data only. */
export async function recapFor(userId: string | null, now = Date.now()) {
  const db = getDb(), loc = await currentLocation(userId).catch(() => null);
  const fed = loc ? await federalLegislators(loc.state, loc.congressional).catch(() => null) : null;
  const follows = userId ? (await db.select({ id: userFollows.politicianId }).from(userFollows).where(eq(userFollows.userId, userId))).map(r => r.id) : [];
  const ids = [...new Set([...(fed?.senators.map(s => s.id) ?? []), ...(fed?.representative ? [fed.representative.id] : []), ...follows])].slice(0, 8);
  if (!ids.length) return null;
  const rows = await db.select({ rollCallId: officialRollCalls.id, votedAt: officialRollCalls.votedAt, question: officialRollCalls.question, title: officialRollCalls.title, sourceUrl: officialRollCalls.sourceUrl,
    billId: officialRollCalls.billId, billTitle: officialBills.title, billType: officialBills.billType, number: officialBills.number, name: officialPoliticians.lastName, full: officialPoliticians.fullName, position: officialMemberVotes.position,
    headline: officialBills.title })
    .from(officialMemberVotes).innerJoin(officialRollCalls, eq(officialRollCalls.id, officialMemberVotes.rollCallId)).innerJoin(officialPoliticians, eq(officialPoliticians.id, officialMemberVotes.politicianId))
    .leftJoin(officialBills, eq(officialBills.id, officialRollCalls.billId)).where(and(inArray(officialMemberVotes.politicianId, ids), gte(officialRollCalls.votedAt, now - 7 * 86400e3)))
    .orderBy(desc(officialRollCalls.votedAt)).limit(30);
  const names = [...new Set(rows.map(r => r.full))];
  const passage = rows.filter(r => voteKind(r.question, r.billTitle ?? r.title) === "passage");
  const pick = (passage.length ? passage : rows).slice(0, 3);
  const card: Card = { eyebrow: "MY LEGISLATORS THIS WEEK", title: new Date(now).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }),
    subtitle: names.length ? names.slice(0, 3).join(" · ") : "No recorded votes this week",
    lines: pick.map(r => { const kind = voteKind(r.question, r.billTitle ?? r.title);
      return voteLine({ billLabel: r.billType ? billLabel(r.billType, r.number!) : r.question, billTitle: r.billTitle ?? r.title ?? r.question, headline: null,
        voteText: `${r.name}: ${positionLine(r.position, kind)}`, kind, kindLabel: KIND_LABEL[kind], votedAt: r.votedAt, sourceUrl: r.sourceUrl }); }),
    note: rows.length > pick.length ? `${rows.length} recorded votes this week; ${pick.length} shown.` : null, footer: "Talk is cheap." };
  return { rows, names, card };
}
