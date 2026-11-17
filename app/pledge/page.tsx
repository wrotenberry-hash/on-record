import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { Answer, Founder } from "@/components/trust/parts";
import { BRAND, brandTitle } from "@/lib/brand";
import { PLEDGE_ALWAYS, PLEDGE_NEVER } from "@/lib/trust";
import { viewerAccess } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Nonpartisan pledge"),
  description: "What this site will always do and never do, each promise tied to how the site works and a way to check it." };

/**
 * The nonpartisan pledge. Every promise is one the code backs up (lib/trust.ts lists them with the check). The
 * funding line is not decided yet: the editor sees the bracketed prompt, readers see a neutral line.
 */
export default async function PledgePage() {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/pledge" access={access}>{null}</PublicShell>;
  const draft = !!access.editor;
  return <PublicShell current="/pledge" access={access}>
    <article className="prose trust">
      <div className="eyebrow">NONPARTISAN PLEDGE{draft ? " · ONE LINE WAITS FOR THE FOUNDER" : ""}</div>
      <h1>What this site will always do, and what it will never do.</h1>
      <p className="lede">{BRAND.name} takes no side. It shows what officials did and leaves the judging to you. Each promise below is tied to how the site works, with a way to check it.</p>

      <h2>We will always</h2>
      <ul className="trust-list pledge-list">{PLEDGE_ALWAYS.map(p => <li key={p.id}>
        <span className="t-name">{p.promise}</span><span className="t-check"><b>How to check:</b> {p.check}</span></li>)}</ul>

      <h2>We will never</h2>
      <ul className="trust-list pledge-list">{PLEDGE_NEVER.map(p => <li key={p.id}>
        <span className="t-name">{p.promise}</span><span className="t-check"><b>How to check:</b> {p.check}</span></li>)}</ul>

      <h2>Money</h2>
      <Answer><Founder k="fundingPledge" draft={draft} /></Answer>
      <p>What is true today is on the <Link href="/about">Who runs this</Link> page, under &ldquo;How it is paid for&rdquo;.</p>

      <h2>If we break a promise</h2>
      <p>Tell us. A broken promise is an error like any other: it is fixed, and the fix is listed on the <Link href="/corrections">corrections page</Link>.</p>

      <p className="fine">The rules behind each promise are set out on <Link href="/method">How this works</Link>.</p>
    </article>
  </PublicShell>;
}
