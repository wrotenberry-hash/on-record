import Link from "next/link";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";

export const PUBLIC_PAGES = [
  { href: "/records", label: "Published records" },
  { href: "/politicians", label: "Politicians" },
  { href: "/issues", label: "Issues" },
  { href: "/following", label: "Following" },
  { href: "/method", label: "How a claim is checked" },
  { href: "/about", label: "Who runs this" },
  { href: "/corrections", label: "Corrections" },
] as const;

type Access = { allowed: boolean; preview: boolean };

/**
 * Frame for the reader-facing pages. The same switch that closes /records
 * closes these: with PUBLIC_READ_ENABLED off, every public page shows the
 * private-review notice and nothing else. Pages that pass `access` (the
 * legislation pages, lib/viewer.ts) also open, as a labelled private preview,
 * to a signed-in editor; pages that do not pass it behave exactly as before.
 */
export function PublicShell({ current, children, access }: { current: string; children: React.ReactNode; access?: Access }) {
  const enabled = access ? access.allowed : publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  const nav = PUBLIC_PAGES.map(p => <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined}>{p.label}</Link>);
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link>
      <nav>{enabled ? nav : <Link href="/editor">Checking instrument</Link>}<small>{access?.preview ? "PRIVATE PREVIEW" : enabled ? "CHECKING RECORDS ONLY" : "PRIVATE REVIEW BUILD"}</small></nav></header>
    {enabled && <nav className="mobile-nav" aria-label="Sections">{nav}</nav>}
    <main>
      {access?.preview && <div className="preview-banner" role="note"><b>Private preview.</b> You can see this page because you are signed in as the editor. Public reading is off, so nobody else can.</div>}
      {enabled ? children : <><div className="intro"><div className="eyebrow">PRIVATE REVIEW</div><h1>This page is not yet public.</h1>
        <p>On Record is being evaluated privately. This page will appear once the editorial team enables public reading.</p></div>
        <div className="notice"><b>Nothing on this site is a finding.</b> Numerical ratings and aggregate scores are disabled.</div></>}
      {enabled && <footer className="public-foot"><nav>{PUBLIC_PAGES.map(p => <Link key={p.href} href={p.href}>{p.label}</Link>)}</nav><small>Talk is cheap. The record isn&apos;t. On Record shows what officials said and did; it does not grade them.</small></footer>}
    </main>
  </>;
}
