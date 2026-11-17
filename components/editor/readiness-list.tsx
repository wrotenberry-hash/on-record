import { GROUPS, type Check } from "@/lib/readiness";

const WORD: Record<Check["state"], string> = { pass: "Pass", fail: "Not yet", owner: "Needs you" };

/** The test-ready checklist on Editor → What's next: every line the owner asked for, with its evidence. */
export function ReadinessList({ checks, totals }: { checks: Check[]; totals: { pass: number; fail: number; owner: number; total: number; builtAndVerified: boolean; readyToOpen: boolean } }) {
  const groups = [...new Set(checks.map(c => c.group))];
  return <>
    <p role="status" className={totals.readyToOpen ? "gate gate-open" : "gate gate-closed"}>
      <b>{totals.readyToOpen ? "Ready to open the trial." : totals.builtAndVerified ? "Built and checked. Waiting on your steps." : "Not ready yet."}</b>{" "}
      {totals.pass} of {totals.total} pass{totals.owner ? `, ${totals.owner} need you` : ""}{totals.fail ? `, ${totals.fail} not yet` : ""}.
    </p>
    {groups.map(g => <section key={g} aria-label={GROUPS[g]}>
      <h3>{g}. {GROUPS[g]}</h3>
      <ul className="next-flags">{checks.filter(c => c.group === g).map(c =>
        <li key={c.id} className={c.state === "pass" ? "next-fyi" : c.state === "owner" ? "next-soon" : "next-blocker"}><b>{WORD[c.state]}</b> {c.label}. <span>{c.detail}</span></li>)}</ul>
    </section>)}
  </>;
}
