import { PublicShell } from "@/components/public/public-shell";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return <PublicShell current="/about">
    <article className="prose">
      <div className="eyebrow">WHO RUNS THIS · DRAFT FOR THE FOUNDER&apos;S EDIT</div>
      <h1>An independent record of what public figures said, and what the evidence shows.</h1>
      <p className="lede">On Record is a small, founder-run project. One human editor reviews every record before it is published. There is no newsroom, no sponsor, and no party behind it.</p>

      <h2>Who</h2>
      <p>[Founder: your name, where you are based, and one sentence on why you started this.] The editor who reviews and publishes records is named on each record&apos;s review line.</p>

      <h2>How it is paid for</h2>
      <p>[Founder: confirm.] On Record is paid for by its founder. It takes no advertising, no sponsorship and no payment from any person, campaign, party or organization whose statements it records. If that ever changes, this page will say so first.</p>

      <h2>What it is for</h2>
      <p>Public claims should be traceable: to the exact words, to the original communication, and to the evidence for and against them. On Record keeps that chain in one place so a reader can follow it without taking anyone&apos;s word for it, including ours.</p>

      <h2>What it is not</h2>
      <p>It is not a scorecard. No record carries a rating, and no person carries a grade. Records are published in the CHECKING state, which means exactly what it says: here is what was claimed, here is what we found, and here is what remains unresolved.</p>

      <h2>Contact</h2>
      <p>[Founder: a contact address for the record.] For a correction request, see the <a href="/corrections">corrections page</a>.</p>
    </article>
  </PublicShell>;
}
