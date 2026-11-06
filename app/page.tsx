import Link from "next/link";
import { redirect } from "next/navigation";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { PublicShell } from "@/components/public/public-shell";

export const dynamic = "force-dynamic";

/** The private review build opens on the checking instrument; the public build opens on the record. */
export default function Home() {
  if (!publicReadEnabled(process.env[PUBLIC_READ_FLAG])) redirect("/editor");
  return <PublicShell current="/">
    <section className="landing">
      <div className="eyebrow">A PUBLIC RECORD OF CLAIMS, WITH THE EVIDENCE ATTACHED</div>
      <h1>What they said. Where they said it. What the evidence shows.</h1>
      <p className="lede">On Record keeps the chain in one place: a public figure&apos;s exact words, the original communication they came from, the claim written out plainly, and a human reviewer&apos;s search for evidence on both sides. No scores. Every record says what is still being checked.</p>
      <div className="landing-actions"><Link className="cta" href="/records">Read the records</Link><Link href="/method">How a claim is checked</Link></div>
      <div className="landing-grid">
        <div><b>The exact words</b><p>A quote is kept verbatim and shown inside the passage it came from. A reviewer confirms it is in the original before anything else happens.</p></div>
        <div><b>The claim, plainly</b><p>Beside the quote, the factual claim in neutral words with its time, place and scope spelled out.</p></div>
        <div><b>Evidence both ways</b><p>Every record documents a search for supporting evidence and a search for contrary evidence, with each source linked.</p></div>
        <div><b>A person, not a machine</b><p>Automation captures sources and proposes leads. Every gate between a captured sentence and a published record is passed by a human.</p></div>
      </div>
      <p className="landing-note">Records are published in the CHECKING state. That is not a verdict; it is a statement of what was claimed, what was found, and what remains unresolved. <Link href="/corrections">If a record is wrong, say so.</Link></p>
    </section>
  </PublicShell>;
}
