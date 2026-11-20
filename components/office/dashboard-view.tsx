import Link from "next/link";
import type { OfficeView } from "@/lib/office/rules";

/**
 * Draws the dashboard from `officeView` (lib/office/rules.ts) and from nothing else. The file to download and the
 * page to print are written from the same view, so all three always show the same thing.
 */
export function DashboardView({ view, links = true }: { view: OfficeView; links?: boolean }) {
  return <div className="office-view">
    <h1>{view.heading}</h1>
    <p className="lede">{view.who} {view.asOf}</p>
    <p className="not-poll">{view.label}</p>
    <ul className="office-notes">{view.notes.map(n => <li key={n}>{n}</li>)}</ul>
    {/* Two sections, never merged (owner, 20 Nov 2026): pending bills, then bills that are already settled. */}
    {view.sections.map(sec => <div key={sec.id} className="office-section" id={`section-${sec.id}`}>
      <h2 className="office-section-h">{sec.title}</h2>
      <p className="meta">{sec.intro}</p>
    {view.tables.filter(t => t.section === sec.id).map(t => <section key={t.id} className="fed-section office-table" id={t.id} aria-labelledby={`${t.id}-h`}>
      <h3 id={`${t.id}-h`}>{t.title}</h3>
      <p className="meta">{t.intro} <span className="not-poll-inline">{view.label}</span></p>
      {t.rows.length ? <div className="office-wrap"><table>
        <thead><tr>{t.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{t.rows.map((row, i) => <tr key={`${t.id}-${i}`}>{row.map((cell, j) => <td key={j} data-label={t.columns[j]}>
          {j === 0 && links && t.hrefs[i] ? <Link href={t.hrefs[i]!}>{cell}</Link> : cell}</td>)}</tr>)}</tbody>
      </table></div> : <p className="meta">{t.empty}</p>}
    </section>)}
    </div>)}
  </div>;
}
