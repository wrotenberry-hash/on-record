import Link from "next/link";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";

export const PUBLIC_PAGES = [
  { href: "/records", label: "Published records" },
  { href: "/method", label: "How a claim is checked" },
  { href: "/about", label: "Who runs this" },
  { href: "/corrections", label: "Corrections" },
] as const;

/**
 * Frame for the reader-facing pages. The same switch that closes /records
 * closes these: with PUBLIC_READ_ENABLED off, every public page shows the
 * private-review notice and nothing else.
 */
export function PublicShell({ current, children }: { current: string; children: React.ReactNode }) {
  const enabled = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link>
      <nav>{enabled ? PUBLIC_PAGES.map(p => <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined}>{p.label}</Link>) : <Link href="/editor">Checking instrument</Link>}<small>{enabled ? "CHECKING RECORDS ONLY" : "PRIVATE REVIEW BUILD"}</small></nav></header>
    <main>
      {enabled ? children : <><div className="intro"><div className="eyebrow">PRIVATE REVIEW</div><h1>This page is not yet public.</h1>
        <p>On Record is being evaluated privately. This page will appear once the editorial team enables public reading.</p></div>
        <div className="notice"><b>Nothing on this site is a finding.</b> Numerical ratings and aggregate scores are disabled.</div></>}
      {enabled && <footer className="public-foot"><nav>{PUBLIC_PAGES.map(p => <Link key={p.href} href={p.href}>{p.label}</Link>)}</nav><small>Every published record is unresolved and labeled CHECKING. No speaker, party or claim carries a score.</small></footer>}
    </main>
  </>;
}
