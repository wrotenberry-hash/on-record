import "./flow.css";
import Link from "next/link";
import { getDb } from "@/db";
import { followAllMine } from "@/app/start/actions";
import { followState } from "@/lib/follow-defaults";
import { deliveryLines, followSummary } from "@/lib/flow/cards";
import { readerEmailReady } from "@/lib/reader-email";

/**
 * Under the cards (owner, 18 Nov 2026, points 1 and 2): what the reader follows and whether vote alerts are on, in
 * their own numbers ("You follow all five. Vote alerts are on."), and a way to change both. A reader who does not
 * follow every one of their own legislators gets one button, named with the real number. Then how an alert can reach
 * them: the site cannot switch on notifications or email by itself, so it says what the reader has to do.
 * The reader's own follows only; nothing here is shown to anyone else.
 */
export async function FollowStatus({ userId, memberIds }: { userId: string | null; memberIds: string[] }) {
  if (!userId || !memberIds.length) return null;
  const state = await followState(getDb(), userId, memberIds).catch(() => null);
  const summary = state ? followSummary({ total: state.total, followed: state.followed, alertsOn: state.alertsOn }) : null;
  if (!state || !summary) return null;
  const how = deliveryLines({ devices: state.devices, hasEmail: state.hasEmail, alertsOn: state.alertsOn, emailOpen: readerEmailReady() });
  return <div className="follow-status" id="follows" role="group" aria-label="Following your legislators">
    <p className="follow-line"><b>{summary.line}</b> {summary.alerts}</p>
    {summary.button && <form action={followAllMine} className="follow-all">
      <button type="submit">{summary.button}</button>
      {!state.alertsChosen && <span className="flow-small">This also turns on vote alerts. You can turn them off on your Account page.</span>}</form>}
    <p className="flow-small">{state.alertsOn ? "A vote alert tells you when a legislator you follow votes on a bill." : "With vote alerts on, the site tells you when a legislator you follow votes on a bill."} {how.push} {how.email}</p>
    <p className="follow-change">{how.links.map(l => <Link key={l.label} href={l.href}>{l.label}</Link>)}</p>
  </div>;
}
