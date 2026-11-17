import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess } from "@/lib/viewer";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Who runs this"), description: "A small, founder-run project with no newsroom, sponsor or party behind it, and no scores or grades." };

/**
 * The founder's own lines are still to be written. Until they are, the editor sees
 * the bracketed prompts and every other reader sees neutral wording that makes no
 * claim beyond what is true today. PUBLIC_CONTACT_EMAIL fills the contact line.
 */
export default async function AboutPage() {
  const access = await viewerAccess();
  const draft = !!access.editor;
  const contact = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  return <PublicShell current="/about" access={access}>
    <article className="prose">
      <div className="eyebrow">WHO RUNS THIS{draft ? " · DRAFT FOR THE FOUNDER'S EDIT" : ""}</div>
      <h1>An independent record of what politicians said and did.</h1>
      <p className="lede">{BRAND.name} is a small, founder-run project. It copies the voting record from government sources, explains bills in plain words, and has one human editor review every checked claim before it is published. There is no newsroom, no sponsor, and no party behind it.</p>
      {BRAND.hasSeparateRecordName && <p>{BRAND.recordSection} is {BRAND.name}&apos;s voting-record section: how each member voted, copied from official roll calls.</p>}

      <h2>Who</h2>
      <p>{draft ? "[Founder: your name, where you are based, and one sentence on why you started this.] " : `${BRAND.name} is run by its founder; a named profile will be here before public launch. `}The editor who reviews and publishes claim records is named on each record&apos;s review line.</p>

      <h2>How it is paid for</h2>
      <p>{draft ? "[Founder: confirm.] " : ""}{BRAND.name} is paid for by its founder. It takes no advertising, no sponsorship and no payment from any person, campaign, party or organization whose statements it records. If that ever changes, this page will say so first.</p>

      <h2>What it is for</h2>
      <p>Public claims and public votes should be traceable: to the exact words, to the official record, and to the evidence for and against them. {BRAND.name} keeps that chain in one place so a reader can follow it without taking anyone&apos;s word for it, including ours.</p>

      <h2>What it is not</h2>
      <p>It is not a scorecard. No record carries a rating, and no person carries a grade. Claim records are published in the CHECKING state, which means exactly what it says: here is what was claimed, here is what we found, and here is what remains unresolved.</p>

      <h2>Contact</h2>
      <p>{contact ? <>Write to <b>{contact}</b>. </> : draft ? "[Founder: a contact address for the record; set PUBLIC_CONTACT_EMAIL in Vercel.] " : "A contact address will be listed here before public launch. "}For a correction request, see the <a href="/corrections">corrections page</a>.</p>
    </article>
  </PublicShell>;
}
