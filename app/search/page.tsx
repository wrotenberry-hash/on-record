import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess } from "@/lib/viewer";
import { search } from "@/lib/search";
import { countEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search · On Record", robots: { index: false, follow: false } };

/** Search bills, members and issues in plain English, with typo tolerance. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const access = await viewerAccess();
  if (!access.allowed) return <PublicShell current="/search" access={access} page="/search">{null}</PublicShell>;
  const q = ((await searchParams).q ?? "").trim();
  const results = q ? await search(q).catch(() => []) : [];
  if (q) await countEvent(results.length ? "search" : "search_empty", access.audience);
  const group = (k: string) => results.filter(r => r.kind === k);
  return <PublicShell current="/search" access={access} page="/search">
    <section className="fed-page">
      <div className="eyebrow">SEARCH</div>
      <h1>Find a bill, a member or an issue</h1>
      <form action="/search" className="search-form" role="search"><label htmlFor="q" className="visually-hidden">Search</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Try: insulin, Cruz, H.R. 2102, border" autoComplete="off" enterKeyHint="search" />
        <button>Search</button></form>
      {q && !results.length && <p className="meta">Nothing matched &ldquo;{q}&rdquo;. Try fewer words, a member&apos;s last name, or a bill number like &ldquo;HR 2102&rdquo;.</p>}
      {(["issue", "member", "bill"] as const).map(k => group(k).length > 0 && <div key={k} className="fed-section"><h2>{k === "issue" ? "Issues" : k === "member" ? "Members" : "Bills"}</h2>
        <ul className="result-list">{group(k).slice(0, k === "bill" ? 25 : 10).map(r => <li key={`${r.kind}-${r.id}`}><Link href={r.href}>{r.label ? <span className="bill-tag">{r.label}</span> : null} {r.title}</Link>{r.meta && <span className="meta">{r.meta}</span>}</li>)}</ul></div>)}
    </section>
  </PublicShell>;
}
