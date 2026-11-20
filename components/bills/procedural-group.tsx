import "./bill-row.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { shortDate } from "@/components/federal/badges";
import { officialMain } from "@/lib/bill-row";
import { PROCEDURAL_EXPLANATION, proceduralLabel } from "@/lib/procedural";

/**
 * "Procedural votes (N)" (owner, 20 Nov 2026; the rule is in lib/procedural.ts): the votes in a list that were on a
 * resolution setting the rules for debating another bill, as one closed line. Opened, it gives the one standard
 * explanation and then each vote plainly: the resolution's official title, how the member voted, the date, the
 * official question and outcome, and the source. No summary and no promise of one. Renders nothing for an empty group.
 */
export type ProceduralVote = { key: string; /** The resolution's official title. */ title: string | null; /** "H.Res. 1247" */ number: string | null;
  /** The resolution's page on this site, when there is one. */ href?: string | null; votedAt: number; /** "Voted Yes", or "Cornyn: Voted Yes · Cruz: Voted No". */ voted: ReactNode;
  /** The official question and outcome ("On Agreeing to the Resolution · Passed 271–135"). */ outcome?: ReactNode; sourceUrl?: string | null };

export function ProceduralGroup({ votes, as: Tag = "li" }: { votes: readonly ProceduralVote[]; as?: "li" | "div" }) {
  if (!votes.length) return null;
  return <Tag className="proc-group">
    <details>
      <summary><span className="proc-label">{proceduralLabel(votes.length)}</span></summary>
      <p className="proc-explain">{PROCEDURAL_EXPLANATION}</p>
      <ul className="proc-list">{votes.map(v => <li key={v.key}>
        <span className="proc-title">{officialMain(v.title)}</span>
        <span className="proc-vote">{v.voted}</span>
        <span className="br-meta">{v.number ? <><span className="br-number">{v.number}</span> · </> : null}{shortDate(v.votedAt)}{v.outcome ? <> · {v.outcome}</> : null}
          {v.sourceUrl ? <> · <a className="src-link" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></> : null}
          {v.href ? <> · <Link className="src-link" href={v.href}>The resolution’s page</Link></> : null}</span>
      </li>)}</ul>
    </details>
  </Tag>;
}
