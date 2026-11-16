import { FUNNEL_LABEL, FUNNEL_ORDER, type FunnelStage } from "@/lib/federal/dashboard-rules";

/**
 * Round I charts: plain HTML tables drawn as bars, so every value is written out
 * (never colour alone), screen readers get a real table, and they work without
 * JavaScript. Party colours passed the colourblind validator in light and dark.
 */
type Funnel = { reach: Record<FunnelStage, number>; pct: Record<FunnelStage, number> };

export function FunnelChart({ f, caption, committeeKnown = true }: { f: Funnel; caption: string; committeeKnown?: boolean }) {
  const max = Math.max(1, f.reach.filed);
  return <table className="chart funnel"><caption>{caption}</caption><tbody>
    {FUNNEL_ORDER.filter(s => committeeKnown || s !== "committee").map(s => <tr key={s} title={`${FUNNEL_LABEL[s]}: ${f.reach[s].toLocaleString("en-US")} (${f.pct[s]}%)`}>
      <th scope="row">{FUNNEL_LABEL[s]}</th>
      <td><span className="bar" style={{ width: `${Math.max(0.6, (100 * f.reach[s]) / max)}%` }} /><span className="val">{f.reach[s].toLocaleString("en-US")} <span className="pct">{f.pct[s]}%</span></span></td></tr>)}
    {f.reach.vetoed > 0 && <tr><th scope="row">Vetoed</th><td><span className="val">{f.reach.vetoed}</span></td></tr>}
  </tbody></table>;
}

const PARTY_ORDER = ["D", "R", "I", "Other"] as const, PARTY_NAME: Record<string, string> = { D: "Democrats", R: "Republicans", I: "Independents", Other: "Other" };
export const partyKey = (p: string) => { const x = p.toLowerCase(); return x.startsWith("dem") ? "D" : x.startsWith("rep") ? "R" : x.startsWith("ind") ? "I" : "Other"; };

/** A chamber's seats by party as one segmented bar with a legend and the counts written out. */
export function SeatBar({ chamber, seats, total }: { chamber: string; seats: Array<{ party: string; n: number }>; total?: number }) {
  const by: Record<string, number> = {};
  for (const s of seats) by[partyKey(s.party)] = (by[partyKey(s.party)] ?? 0) + s.n;
  const sum = total ?? Object.values(by).reduce((a, b) => a + b, 0), majority = Math.floor(sum / 2) + 1;
  return <figure className="seat-chart"><figcaption><b>{chamber}</b> · {sum} seats · majority {majority}</figcaption>
    <div className="seat-bar" role="img" aria-label={PARTY_ORDER.filter(p => by[p]).map(p => `${PARTY_NAME[p]} ${by[p]}`).join(", ")}>
      {PARTY_ORDER.filter(p => by[p]).map(p => <span key={p} className={`seg ps-${p}`} style={{ flexGrow: by[p] }} title={`${PARTY_NAME[p]}: ${by[p]}`} />)}
      <span className="majority-line" style={{ left: `${(100 * majority) / sum}%` }} aria-hidden="true" /></div>
    <ul className="legend">{PARTY_ORDER.filter(p => by[p]).map(p => <li key={p}><span className={`swatch ps-${p}`} aria-hidden="true" />{PARTY_NAME[p]} {by[p]}</li>)}</ul></figure>;
}

/** Rows of name + value with a proportional bar (one hue), e.g. committees by bills referred. */
export function RowBars({ rows, caption, unit }: { rows: Array<{ label: React.ReactNode; value: number; note?: string }>; caption: string; unit: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <table className="chart rows"><caption>{caption}</caption><tbody>{rows.map((r, i) => <tr key={i}><th scope="row">{r.label}</th>
    <td><span className="bar" style={{ width: `${Math.max(0.6, (100 * r.value) / max)}%` }} /><span className="val">{r.value.toLocaleString("en-US")} {unit}{r.note ? <span className="pct"> {r.note}</span> : null}</span></td></tr>)}</tbody></table>;
}
