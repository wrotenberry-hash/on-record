import Link from "next/link";
import { getDb } from "@/db";
import { shortDate } from "@/components/federal/badges";
import { billChanges } from "@/lib/entry/cards";
import { voteKind } from "@/lib/federal/vote-kinds";
import { isQuietKill } from "@/lib/said-did-rules";
import { NOT_SCIENTIFIC } from "@/lib/constituent/rules";
import type { TotalsBlock } from "@/lib/constituent/view";
import "./share.css";

const CAP = 5;
const endLine = (shown: number, all: number, what: string) => (all > shown ? `Those are the ${shown} most recent of ${all} ${what}.` : all === 1 ? `That is the only ${what.replace(/s$/, "")}.` : `That is all ${all} ${what}.`);
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

/**
 * The share menu on a bill page (owner's point 10): one sourced fact per card, of three kinds. A vote (one roll
 * call's result), a change between two versions of the bill, and what counted residents of the reader's own
 * district or state said, which is offered only from 25 counted voters. Each list is capped and ends with a line.
 * Links carry `src=bill`, so the share screen can count one share started from a bill (aggregate only).
 */
export async function BillShareMenu({ billId, billTitle, hasSummary, votes, totals }: { billId: string; billTitle: string; hasSummary: boolean;
  votes: Array<{ id: string; chamber: string; votedAt: number; question: string; title: string | null; result: string | null }>; totals?: TotalsBlock[] | null }) {
  const changes = await billChanges(getDb(), billId).catch(() => null);
  const recent = [...votes].sort((a, b) => b.votedAt - a.votedAt), shownVotes = recent.slice(0, CAP);
  const items = changes?.items ?? [], shownChanges = items.slice(0, CAP);
  const places = (totals ?? []).filter(t => t.kind !== "nation");
  const open = places.filter(t => t.shown.show);
  const q = (rest: string) => `/share/card?${rest}&src=bill`;
  return <div className="fed-section" id="share"><h2>Share one fact from this bill</h2>
    <p className="meta">Each card carries one fact, its date and its source. You can add your own answer on the next screen if you choose.</p>
    <div className="share-menu">
      <div><h3>A vote</h3>
        {shownVotes.length ? <><ul>{shownVotes.map(v => { const quiet = isQuietKill(voteKind(v.question, v.title ?? billTitle), v.question, v.result);
          return <li key={v.id}><Link href={q(`t=${quiet ? "quiet" : "roll"}&roll=${v.id}`)}>{v.chamber === "senate" ? "Senate" : "House"}, {shortDate(v.votedAt)}: {clip(v.question, 60)}{v.result ? `. ${clip(v.result, 40)}` : ""}</Link></li>; })}</ul>
          <p className="end-line">{endLine(shownVotes.length, recent.length, "recorded votes")}</p></>
          : <p className="end-line">No recorded vote on this bill yet, so there is no vote to share.</p>}</div>
      <div><h3>A change to the bill</h3>
        {shownChanges.length ? <><ul>{shownChanges.map(c => <li key={c.key}><Link href={q(`t=change&bill=${billId}&c=${c.key}`)}>{clip(c.text, 90)}</Link></li>)}</ul>
          <p className="end-line">{endLine(shownChanges.length, items.length, "changes")} From the {changes!.fromType.toLowerCase()} text to the {changes!.toType.toLowerCase()} text.</p></>
          : <p className="end-line">{changes ? "The two latest versions of this bill have the same sections, so there is no change to share." : "No two versions of this bill have been compared yet, so there is no change to share."}</p>}</div>
      <div><h3>What counted residents said</h3>
        {open.length ? <><ul>{open.map(t => <li key={t.scope}><Link href={q(`t=total&bill=${billId}&scope=${t.scope}`)}>{t.scope}: {t.shown.show ? t.shown.voters : 0} counted residents</Link></li>)}</ul>
          <p className="end-line">{open.length === places.length ? "Those are the totals for where you live." : "A place with fewer than 25 counted residents has no total to share yet."} {NOT_SCIENTIFIC}</p></>
          : <p className="end-line">{places.length ? "Your district and state have fewer than 25 counted residents on this bill, so there is no total to share yet." : "Look up your legislators to see whether your district has a total to share."} {NOT_SCIENTIFIC}</p>}</div>
      <div><h3>The bill</h3>
        <ul><li><Link className="tap" href={q(`t=bill&bill=${billId}`)}>Where it stands</Link></li>
          {hasSummary && <li><Link className="tap" href={q(`t=carousel&bill=${billId}`)}>5-slide explainer</Link></li>}</ul>
        <p className="end-line">That is everything you can share from this bill.</p></div>
    </div>
    <p className="meta">Cards are built from the record only. Each has the badges, the date, the source and a &ldquo;Report a problem&rdquo; link.</p></div>;
}
