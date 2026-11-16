import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { officialFloorSchedule, officialRollCalls, txBills } from "@/db/schema";
import { congressCounts } from "@/lib/federal/depth";
import { weekOf } from "@/lib/federal/depth-parse";
import { currentTxSession, TX_SESSIONS } from "@/lib/texas/parse";
import { shortDate } from "@/components/federal/badges";

/** Home "Right now": who is in session, what is on the floor this week, and session counts. Official data, with its date. */
const clock = () => Date.now();
export async function RightNow() {
  const db = getDb(), now = clock(), today = new Date(now).toISOString().slice(0, 10), week = weekOf(now);
  const [house, senate, floor, counts] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(officialRollCalls).where(and(eq(officialRollCalls.chamber, "house"), gte(officialRollCalls.votedAt, now - 4 * 86400e3))).get(),
    db.select({ n: sql<number>`count(*)` }).from(officialRollCalls).where(and(eq(officialRollCalls.chamber, "senate"), gte(officialRollCalls.votedAt, now - 4 * 86400e3))).get(),
    db.select({ chamber: officialFloorSchedule.chamber, n: sql<number>`count(*)` }).from(officialFloorSchedule).where(eq(officialFloorSchedule.weekOf, week)).groupBy(officialFloorSchedule.chamber),
    congressCounts().catch(() => null),
  ]);
  const tx = currentTxSession(today), next = TX_SESSIONS.filter(s => s.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
  const txFocus = tx.inSession ? tx.session : next ?? tx.session;
  const txCounts = await db.select({ total: sql<number>`count(*)`, laws: sql<number>`sum(case when ${txBills.stage} = 'law' then 1 else 0 end)` }).from(txBills).where(eq(txBills.session, txFocus.id)).get().catch(() => null);
  const onFloor = (c: string) => Number(floor.find(f => f.chamber === c)?.n ?? 0);
  const status = (votes: number, items: number) => (votes > 0 || items > 0 ? "In session this week" : "No votes this week");
  return <section className="right-now" aria-label="Right now">
    <div className="rn-cell"><b>House</b><span>{status(Number(house?.n ?? 0), onFloor("house"))}</span>{onFloor("house") > 0 && <Link href="/coming">{onFloor("house")} items on the floor schedule</Link>}</div>
    <div className="rn-cell"><b>Senate</b><span>{status(Number(senate?.n ?? 0), onFloor("senate"))}</span>{onFloor("senate") > 0 && <Link href="/coming">{onFloor("senate")} bills named on the floor schedule</Link>}</div>
    <div className="rn-cell"><b>Texas Legislature</b><span>{tx.inSession ? `In session (${tx.session.tlo})` : next ? `Convenes ${shortDate(next.start)}` : "Not in session"}</span>{Number(txCounts?.total ?? 0) > 0 && <Link href="/texas">{txCounts!.total} bills {tx.inSession ? "this session" : "prefiled"}</Link>}</div>
    {counts && <div className="rn-cell"><b>{counts.congress}th Congress</b><span>{counts.bills?.toLocaleString() ?? "?"} bills introduced · {counts.laws ?? "?"} became law</span><span className="meta">Congress.gov, {shortDate(counts.at)}</span></div>}
  </section>;
}
