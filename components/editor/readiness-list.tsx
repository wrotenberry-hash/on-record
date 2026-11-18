import { GROUPS, type Check } from "@/lib/readiness";

const WORD: Record<Check["state"], string> = { pass: "Pass", fail: "Not yet", owner: "Needs you" };

/** The test-ready checklist on Editor → What's next: every line the owner asked for, with its evidence. */
export function ReadinessList({ checks, totals }: { checks: Check[]; totals: { pass: number; fail: number; owner: number; total: number; builtAndVerified: boolean; readyToOpen: boolean } }) {
  return <>
    <p role="status" className={totals.readyToOpen ? "gate gate-open" : "gate gate-closed"}>
      <b>{totals.readyToOpen ? "Ready to open the trial." : totals.builtAndVerified ? "Built and checked. Waiting on your steps." : "Not ready yet."}</b>{" "}
      {totals.pass} of {totals.total} pass{totals.owner ? `, ${totals.owner} need you` : ""}{totals.fail ? `, ${totals.fail} not yet` : ""}.
    </p>
    <CheckGroups checks={checks} groups={GROUPS} />
  </>;
}

/** The Texas checklist (docs/TEXAS_BUILD.md): the owner's Texas points, with the go-live date and the days left. */
export function TexasReadinessList({ checks, totals, groups }: { checks: Check[]; groups: Record<number, string>;
  totals: { pass: number; fail: number; owner: number; total: number; live: boolean; goLive: string; daysToGoLive: number; sessionOpens: string; daysToSession: number } }) {
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return <>
    <p role="status" className={totals.live ? "gate gate-open" : "gate gate-closed"}>
      <b>{totals.live ? "Texas is fully live." : `Target: fully live by ${day(totals.goLive)}${totals.daysToGoLive >= 0 ? ` (${totals.daysToGoLive} days)` : ` (${-totals.daysToGoLive} days ago)`}.`}</b>{" "}
      {totals.pass} of {totals.total} pass{totals.owner ? `, ${totals.owner} need you` : ""}{totals.fail ? `, ${totals.fail} not yet` : ""}. The session opens {day(totals.sessionOpens)}{totals.daysToSession >= 0 ? `, in ${totals.daysToSession} days` : ""}.
    </p>
    <CheckGroups checks={checks} groups={groups} />
  </>;
}

function CheckGroups({ checks, groups }: { checks: Check[]; groups: Record<number, string> }) {
  const ids = [...new Set(checks.map(c => c.group))];
  return <>{ids.map(g => <section key={g} aria-label={groups[g]}>
    <h3>{g}. {groups[g]}</h3>
    <ul className="next-flags">{checks.filter(c => c.group === g).map(c =>
      <li key={c.id} className={c.state === "pass" ? "next-fyi" : c.state === "owner" ? "next-soon" : "next-blocker"}><b>{WORD[c.state]}</b> {c.label}. <span>{c.detail}</span></li>)}</ul>
  </section>)}</>;
}
