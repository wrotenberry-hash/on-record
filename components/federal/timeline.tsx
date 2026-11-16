import { shortDate } from "@/components/federal/badges";
import { GLOSSARY } from "@/lib/glossary";
import { Term } from "@/components/ui/term";

type Floor = { passed: boolean; rollCallId: string | null };
type Step = { key: string; label: string; date: string | null; text: string | null; done: boolean; floor?: Floor };
const TERM_FOR: Record<string, string> = { committee: "referred", resolving: "conference", vetoed: "veto" };

/**
 * The bill's path as a list of steps (works as a graphic and as text for screen readers). Official, from Congress.gov actions
 * and the roll calls on file. A floor vote (motion to proceed, cloture, discharge, failed passage, veto override) is a step of
 * its own with a plain-English line on what it means, and links to the vote when we have it.
 */
export function Timeline({ steps, current, sourceUrl }: { steps: Step[]; current: string; sourceUrl: string }) {
  return <ol className="timeline" aria-label="Where this bill is">
    {steps.map(s => <li key={s.key} className={`tl-step ${s.done ? "done" : "todo"} ${s.key === current ? "now" : ""} ${s.floor ? `tl-floor ${s.floor.passed ? "tl-floor-passed" : "tl-floor-failed"}` : `tl-${s.key}`}`} aria-current={s.key === current ? "step" : undefined}>
      <span className="tl-dot" aria-hidden="true" />
      <span className="tl-label">{TERM_FOR[s.key] ? <Term definition={GLOSSARY[TERM_FOR[s.key]]}>{s.label}</Term> : s.label}{s.floor && s.date ? `, ${shortDate(s.date)}` : ""}</span>
      {!s.floor && <span className="tl-date">{s.done ? (s.date ? shortDate(s.date) : "done") : "not yet"}</span>}
      {s.floor ? <span className="tl-text">{s.text}{s.floor.rollCallId && <> <a href={`#vote-${s.floor.rollCallId}`}>See the vote</a></>}</span>
        : s.done && s.text && <span className="tl-text">{s.text}</span>}
    </li>)}
    <li className="tl-source"><a className="src-link" href={sourceUrl.replace("api.congress.gov/v3/bill", "www.congress.gov/bill").replace(/\?.*$/, "")} target="_blank" rel="noopener noreferrer">All actions (Congress.gov)</a></li>
  </ol>;
}
