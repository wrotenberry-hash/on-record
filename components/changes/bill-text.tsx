import Link from "next/link";
import { OfficialBadge, shortDate } from "@/components/federal/badges";
import { sectionAnchor, sectionTitle } from "@/lib/changes/sections";
import type { StoredSection, StoredVersion } from "@/lib/changes/types";
import "./bill-text.css";

/**
 * A bill's stored text, one version at a time, section by section (Suggest changes; owner, 20 Nov 2026). The official
 * federal text page has no anchors, so "the exact section" is shown here: each section has its own heading with an id
 * (#sec-2), its text exactly as stored from the official file, the version and its date, and a link to that file.
 * Nothing on this page is written by the site except the labels around the text.
 */
export function BillText({ base, back, backLabel, eyebrow, title, versions, current, sections, officialUrl, officialLabel, marks }: {
  /** This page's own address, without a query ("/bills/119-hr-2102/text"). */
  base: string;
  back: string; backLabel: string; eyebrow: string;
  /** The bill's official title. */
  title: string;
  /** Stored versions, newest first. */
  versions: StoredVersion[];
  /** The version on show, or null when nothing is stored. */
  current: StoredVersion | null;
  sections: StoredSection[];
  /** Where the official text is, when the site knows: used when nothing is stored yet. */
  officialUrl: string | null; officialLabel: string;
  /** How this publisher marks changes inside the text, in one plain sentence (Texas). */
  marks?: string;
}) {
  const dated = (v: { label: string; date: string | null }) => `${v.label}${v.date ? `, ${shortDate(v.date)}` : ""}`;
  // Ids are unique on the page even if a text repeats a section number.
  const seen = new Set<string>();
  const rows = sections.map(s => { let id = sectionAnchor(s.num); if (seen.has(id)) id = `${id}-${s.seq}`; seen.add(id); return { s, id, name: sectionTitle(s) }; });
  return <section className="fed-page bill-page bill-text-page">
    <p className="crumbs"><Link href={back}>← {backLabel}</Link></p>
    <div className="eyebrow">{eyebrow}</div>
    <h1>Bill text, as published</h1>
    <p className="official-line"><OfficialBadge /> <span>{title}</span></p>
    {!current ? <p className="empty-note">The text of this bill has not been read yet.{officialUrl ? <> <a href={officialUrl} target="_blank" rel="noopener noreferrer">{officialLabel}</a></> : null}</p> : <>
      <p className="lede">Each section below is copied from the official file. The words, numbers and punctuation are not changed; only the line breaks are.</p>
      {marks && <p className="meta">{marks}</p>}
      {sections.some(s => s.body.includes("<DELETED>")) && <p className="meta">Words between &lt;DELETED&gt; and &lt;/DELETED&gt; were struck out by a committee: they are printed in the official file but are no longer part of this version.</p>}
      <nav className="fed-section" aria-label="Versions of this bill">
        <h2>Versions</h2>
        <ul className="bill-text-versions">{versions.map(v => <li key={v.version}>
          {v.version === current.version ? <span aria-current="page"><b>{dated(v)}</b> (shown below)</span> : <Link href={`${base}?v=${encodeURIComponent(v.version)}`}>{dated(v)}</Link>}</li>)}</ul>
      </nav>
      <p className="bill-text-which">This is the <b>{current.label}</b> version{current.date ? <>, dated {shortDate(current.date)}</> : <>; its date is not on file</>}. It has {rows.length} {rows.length === 1 ? "part" : "parts"}.{" "}
        <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer">Read the official file</a></p>
      {rows.length > 3 && <details className="primer"><summary>Jump to a section</summary>
        <ol className="bill-text-index">{rows.map(r => <li key={r.id}><a href={`#${r.id}`}>{r.name}</a></li>)}</ol></details>}
      {rows.map(r => <div key={r.id} className="fed-section bill-text-section">
        <h2 id={r.id}>{r.name}</h2>
        <div className="bill-text">{r.s.body}</div>
        <p className="meta">{dated({ label: `${r.s.versionLabel} version`, date: r.s.versionDate })}. <a className="tap" href={r.s.sourceUrl} target="_blank" rel="noopener noreferrer">Read the official file</a></p>
      </div>)}
    </>}
  </section>;
}
