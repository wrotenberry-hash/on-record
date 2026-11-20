import "./flow.css";
import Link from "next/link";
import { OpinionBadge } from "@/components/federal/badges";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import type { Location } from "@/lib/location";
import { verificationConfig } from "@/lib/verify/config";
import { profileFor, scopeTotals } from "@/lib/verify/store";
import { answeredBills } from "@/lib/flow/data";
import { districtCompareLine } from "@/lib/flow/rules";
import { WHAT_THIS_BILL_DOES } from "@/lib/bill-row";

const ANSWER = { support: "Support", oppose: "Oppose", unsure: "Not sure" } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "See how your district compares": for the bills the reader has answered, the district's total once 25 counted
 * residents have answered, and otherwise why there is no number yet. It shows even while counting is switched off
 * (then nothing is being counted, and it says so). A total below 25 is never shown.
 * A counted resident is address-matched or mail-verified; address matching is never called "verifying" here.
 */
export async function DistrictCompare({ userId, loc }: { userId: string | null; loc: Location | null }) {
  const enabled = verificationConfig().enabled;
  const bills = await answeredBills(userId, 5).catch(() => []);
  // An address-matched reader's answers count in the district their address matched; otherwise the district found from the ZIP or address.
  const account = enabled && userId ? (await currentAccount().catch(() => null)) ?? (await accountForAppUser(userId).catch(() => null)) : null;
  const profile = account ? await profileFor(account.id).catch(() => null) : null;
  const district = profile?.districtId ?? loc?.congressional ?? null;
  const totals = enabled && district && bills.length ? await scopeTotals(district, bills.map(b => b.billId)).catch(() => []) : [];
  const lines = bills.map(b => ({ b, line: districtCompareLine({ enabled, district, totals: totals.find(t => t.billId === b.billId && t.tierGroup === "district") ?? null }) }));
  const general = districtCompareLine({ enabled, district, totals: null });
  const anyShown = lines.some(l => l.line.state === "shown"), anyHidden = !lines.length || lines.some(l => l.line.state !== "shown");
  return <section className="flow-block" id="district" aria-labelledby="district-h">
    <h2 id="district-h">See how your district compares <OpinionBadge title="Answers from readers, added up without names" /></h2>
    {lines.length ? <ul className="flow-compare">{lines.map(({ b, line }) => <li key={b.billId}>
      <span><b>{cap(b.name.text)}</b> <span className="meta">{b.billLabel}</span></span>
      <span>Your answer: <b>{ANSWER[b.answer]}</b></span>
      {line.state === "shown" ? <span className="flow-total">{line.text}</span> : <span className="meta">{district ? `${district}: ` : ""}no total yet</span>}
      <Link className="flow-billlink" href={`/bills/${b.billId}`}>{WHAT_THIS_BILL_DOES}<span className="visually-hidden">: {b.name.text}</span></Link></li>)}</ul>
      : <p className="meta">Answer a bill above and it appears here beside your district’s total.</p>}
    {anyHidden && <p className="flow-threshold" role="note">{general.text}</p>}
    {anyShown && <p className="meta">Not a scientific poll. Totals count address-matched and mail-verified residents only.</p>}
    <p className="flow-small">{enabled
      ? <>To be counted: sign in with your email on your <Link href="/account#verify">Account page</Link>, then confirm a mobile number and match your home address. Answers you have already saved join the totals with your first counted answer.</>
      : <>When counting opens, you will match your home address on your <Link href="/account">Account page</Link>. Your answers are saved and stay private until then.</>}</p>
  </section>;
}
