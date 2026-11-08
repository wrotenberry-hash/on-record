import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { listPublicCorrections } from "@/lib/published-records";

export const dynamic = "force-dynamic";

export default async function CorrectionsPage() {
  const items = publicReadEnabled(process.env[PUBLIC_READ_FLAG]) ? await listPublicCorrections() : [];
  return <PublicShell current="/corrections">
    <article className="prose">
      <div className="eyebrow">CORRECTIONS · DRAFT FOR THE FOUNDER&apos;S EDIT</div>
      <h1>If a record is wrong, say so. Here is what happens next.</h1>
      <p className="lede">Every record is built so it can be checked by anyone. When a check finds an error, the record is corrected in the open, and the earlier version stays visible.</p>

      <h2>What counts as a correction</h2>
      <ul>
        <li>The quote is not what the person said, or is shown out of its context.</li>
        <li>The claim is attributed to the wrong person or the wrong date.</li>
        <li>The proposition misstates the claim&apos;s time, place, scope or quantity.</li>
        <li>Evidence cited on the record does not say what the record says it says, or newer evidence changes what remains unresolved.</li>
      </ul>
      <p>Disagreeing with how much a claim matters, or wanting a claim rated, is not a correction. Records carry no rating.</p>

      <h2>How to request one</h2>
      <p>Send the record&apos;s link, the sentence you believe is wrong, and the source that shows it, to [Founder: contact address]. Anyone may ask, including the person quoted. Requests are read by the editor; there is no automated handling.</p>

      <h2>What happens</h2>
      <ol>
        <li>The editor re-opens the original source and the evidence named in the request.</li>
        <li>If the record is wrong, a corrected record is published with a note saying what changed and why. The earlier version is kept and linked from the correction; it is never silently overwritten.</li>
        <li>If the record cannot stand at all, it is retracted, and the retraction is itself a published, dated event.</li>
        <li>If the record is right, the request and the reason it was declined are kept in the record&apos;s private history.</li>
      </ol>
      <p>[Founder: decide whether to publish a response time, and whether declined requests are summarized publicly. Neither is promised here until decided.]</p>

      <h2>Corrections so far</h2>
      {items.length ? <ol className="corrections-list">{items.map((c, i) => <li key={i}>
        <div className="eyebrow">{c.kind === "correction" ? "CORRECTION" : "RETRACTION"} · {new Date(c.at).toLocaleDateString()}</div>
        <p><b>{c.speakerName}</b>: &ldquo;{c.exactText.length > 160 ? `${c.exactText.slice(0, 157).trimEnd()}…` : c.exactText}&rdquo;</p>
        <p>{c.reason}</p>
        <p className="fine-links">{c.replacementRecordId ? <Link href={`/records/${c.replacementRecordId}`}>Corrected record</Link> : <span>No replacement record.</span>} <span>Original record id {c.originalRecordId}.</span></p>
      </li>)}</ol>
      : <p>None. This section lists every correction and retraction, newest first, as soon as there is one.</p>}
    </article>
  </PublicShell>;
}
