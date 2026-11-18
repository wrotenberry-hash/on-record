/**
 * Postcards, for the editor (Editor → Flagged answers): whether the step is on, this month's cards by outcome, the
 * money against the cap, and codes typed in. Counts only: never an account, an address or a code.
 */
import { getDb } from "@/db";
import { NOT_READY_LABEL, postcardSettings } from "@/lib/mail-verify/sender";
import { postcardCounts } from "@/lib/mail-verify/store";

const requestTime = () => Date.now();
const money = (n: number) => `$${n.toFixed(2)}`;

export async function MailVerifyCounts() {
  const s = postcardSettings(process.env), c = await postcardCounts(getDb(), requestTime()).catch(() => null);
  const state = s.mode === "off" ? "Postcards off." : s.mode === "mock" ? "Postcards in test mode: nothing is mailed and nothing is charged. Only the editor sees the postcard step."
    : s.mode === "live" ? `Postcards on, mailed by ${s.vendor} at ${money(s.pieceCostUsd)} a card.` : `Postcards not ready: ${NOT_READY_LABEL[s.notReady ?? "adapter_not_built"]}. Nothing is mailed.`;
  return <>
    <h2 id="postcards">Postcards · mail-verified</h2>
    <p className={s.mode === "live" ? "gate gate-open" : "gate gate-closed"} role="status"><b>{state}</b>{" "}
      {c ? <>This month: {c.month.requested} requested · {c.month.mock} test (nothing mailed) · {c.month.sent} mailed · {c.month.failed} failed{c.month.queued ? ` · ${c.month.queued} waiting` : ""} · spent {money(c.spentMonthUsd)} of {money(s.capUsd)}.
        Codes typed in this month: {c.codesRedeemedMonth}. Accounts mail-verified now: {c.mailVerifiedNow}.</> : "The counts could not be read."}</p>
    <p className="meta">Limits: two postcards per address in a year, one account per code, a code works for 30 days, and the month&apos;s spending never passes the cap. The vendor comparison and what is still to decide are in docs/POSTCARD_VENDORS.md.</p>
  </>;
}
