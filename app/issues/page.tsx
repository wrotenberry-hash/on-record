import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess } from "@/lib/viewer";
import { categoriesWithCounts, listMappings } from "@/lib/federal/queries";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  const access = await viewerAccess();
  const [categories, mappings] = access.allowed ? await Promise.all([categoriesWithCounts(), listMappings()]) : [[], []];
  return <PublicShell current="/issues" access={access}>
    <section className="fed-page">
      <div className="eyebrow">ISSUES</div>
      <h1>Browse by issue</h1>
      <p className="lede">Bills in Congress, grouped by what they are about. A bill can sit under more than one issue. Topics come from Congress.gov&apos;s own subject labels, sorted by the fixed rules below, the same for every bill and every sponsor.</p>
      <ul className="issue-grid">{categories.map(c => <li key={c.slug}><Link href={`/issues/${c.slug}`}><b>{c.name}</b><span>{c.bills ? `${c.bills} ${c.bills === 1 ? "bill" : "bills"}` : "No bills yet"}</span></Link></li>)}</ul>
      {access.allowed && !categories.length && <p className="empty-note">Issues appear after the first scheduled update.</p>}
      {mappings.length > 0 && <details className="mapping"><summary>How bills are sorted into issues ({mappings.length} rules)</summary>
        <p className="meta">Congress.gov gives every bill one policy area and a list of subjects. A bill goes under an issue when one of these rules matches. Policy areas with no rule here (for example Native Americans or International Affairs) are left out rather than forced into an issue.</p>
        <div className="mapping-table"><table><thead><tr><th>Issue</th><th>Congress.gov label</th><th>Rule</th></tr></thead><tbody>
        {mappings.map(m => <tr key={`${m.sourceKind}-${m.matchKind}-${m.sourceValue}-${m.categoryName}`}><td>{m.categoryName}</td><td>{m.sourceValue}{m.note ? <small> · {m.note}</small> : null}</td>
          <td>{m.sourceKind === "policy_area" ? "Policy area" : "Subject"}{m.matchKind === "contains" ? " contains" : " is"}</td></tr>)}</tbody></table></div></details>}
    </section>
  </PublicShell>;
}
