import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { OfficialBadge, memberLine } from "@/components/federal/badges";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { followedIds, listPoliticians, listStates } from "@/lib/federal/queries";

export const dynamic = "force-dynamic";

export default async function PoliticiansPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; chamber?: string }> }) {
  const access = await viewerAccess();
  const params = await searchParams;
  const [rows, states, followed] = access.allowed
    ? await Promise.all([listPoliticians(params), listStates(), currentAppUserId().then(followedIds)]) : [[], [], new Set<string>()];
  return <PublicShell current="/politicians" access={access}>
    <section className="fed-page">
      <div className="eyebrow">MEMBERS OF CONGRESS <OfficialBadge /></div>
      <h1>Politicians</h1>
      <p className="lede">Every sitting senator and representative, with how they voted. On Record shows the record; it does not grade anyone.</p>
      <form className="fed-filter" method="get">
        <label>Name<input name="q" defaultValue={params.q ?? ""} placeholder="e.g. Cornyn" /></label>
        <label>State<select name="state" defaultValue={params.state ?? ""}><option value="">All</option>{states.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Chamber<select name="chamber" defaultValue={params.chamber ?? ""}><option value="">Both</option><option value="senate">Senate</option><option value="house">House</option></select></label>
        <button type="submit">Show</button>
      </form>
      <p className="count">{rows.length} {rows.length === 1 ? "member" : "members"}</p>
      <ul className="member-list">{rows.map(p => <li key={p.id}><Link href={`/politicians/${p.id}`}><b>{p.fullName}</b><span>{memberLine(p)}</span>{followed.has(p.id) && <em>Following</em>}</Link></li>)}</ul>
      {access.allowed && !rows.length && <p className="empty-note">No members yet. The member list loads with the next scheduled update.</p>}
    </section>
  </PublicShell>;
}
