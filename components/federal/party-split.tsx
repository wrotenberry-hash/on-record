/**
 * Yea and Nay by party as a stacked bar with the numbers written out, so the
 * chart never depends on colour alone. Same treatment for every party.
 */
const ORDER = ["D", "R", "I", "Other"] as const;
const NAME: Record<string, string> = { D: "Democrats", R: "Republicans", I: "Independents", Other: "Other" };

export function PartySplit({ parties }: { parties: Record<string, Record<string, number>> | undefined }) {
  if (!parties) return null;
  const rows = (["Yea", "Nay"] as const).map(pos => ({ pos, by: parties[pos] ?? {}, total: Object.values(parties[pos] ?? {}).reduce((a, b) => a + b, 0) }));
  const max = Math.max(1, ...rows.map(r => r.total));
  return <div className="party-split" role="group" aria-label="Votes by party">
    {rows.map(r => <div key={r.pos} className="ps-row">
      <span className="ps-pos">{r.pos === "Yea" ? "Yes" : "No"} {r.total}</span>
      <span className="ps-bar" style={{ width: `${(r.total / max) * 100}%` }} aria-hidden="true">
        {ORDER.filter(p => r.by[p]).map(p => <span key={p} className={`ps-seg ps-${p}`} style={{ flexGrow: r.by[p] }} />)}
      </span>
      <span className="ps-text">{ORDER.filter(p => r.by[p]).map(p => `${NAME[p]} ${r.by[p]}`).join(" · ") || "none"}</span>
    </div>)}
  </div>;
}
