/**
 * Round F party parity (pure; tested in tests/dashboard.test.mjs). Summaries are
 * grouped by the bill sponsor's party and compared on length, evaluative ("tone")
 * words and the balance between the case for and the case against. The same rules
 * apply to every party. Drift is reported only with at least MIN_PER_PARTY
 * summaries in each party compared.
 */
export const TONE_WORDS = ["important", "critical", "crucial", "vital", "essential", "needed", "necessary", "harmful", "burdensome", "excessive", "unfair",
  "costly", "wasteful", "risky", "protect", "protects", "strengthen", "strengthens", "weaken", "weakens", "undermine", "undermines", "threaten", "threatens",
  "improve", "improves", "hurt", "hurts", "benefit", "benefits", "help", "helps", "fix", "fixes", "failed", "failing", "broken", "overreach", "burden"] as const;
export const MIN_PER_PARTY = 10;
export const DRIFT = { lengthRatio: 1.2, tonePer100Gap: 0.5, toneRatio: 2, balanceGap: 0.08, balanceLow: 0.42, balanceHigh: 0.58 } as const;

export type ParityRow = { party: string; prose: string; forText: string; againstText: string; forCount: number; againstCount: number };
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);
export function toneHits(text: string) {
  const ws = words(text.toLowerCase().replace(/[^a-z\s-]/g, " "));
  return ws.filter(w => (TONE_WORDS as readonly string[]).includes(w)).length;
}
export function partyGroup(party: string | null | undefined) { const p = (party ?? "").toLowerCase(); return p.startsWith("dem") ? "D" : p.startsWith("rep") ? "R" : p ? "I" : "?"; }

export function parityStats(rows: readonly ParityRow[]) {
  const by = new Map<string, { n: number; words: number; tone: number; balance: number; forCount: number; againstCount: number }>();
  for (const r of rows) {
    const g = partyGroup(r.party), e = by.get(g) ?? { n: 0, words: 0, tone: 0, balance: 0, forCount: 0, againstCount: 0 };
    const w = words(r.prose).length, fw = words(r.forText).length, aw = words(r.againstText).length;
    e.n++; e.words += w; e.tone += w ? (100 * toneHits(r.prose)) / w : 0; e.balance += fw + aw ? fw / (fw + aw) : 0.5; e.forCount += r.forCount; e.againstCount += r.againstCount;
    by.set(g, e);
  }
  const out: Record<string, { n: number; avgWords: number; tonePer100: number; forShare: number; forArgs: number; againstArgs: number }> = {};
  for (const [g, e] of by) out[g] = { n: e.n, avgWords: Math.round(e.words / e.n), tonePer100: Math.round((100 * e.tone) / e.n) / 100, forShare: Math.round((100 * e.balance) / e.n) / 100, forArgs: e.forCount, againstArgs: e.againstCount };
  return out;
}

/** Plain-language drift findings between the two largest parties (D and R), plus each party's own for/against balance. */
export function parityDrift(stats: ReturnType<typeof parityStats>): { enough: boolean; findings: string[] } {
  const d = stats.D, r = stats.R, findings: string[] = [];
  if (!d || !r || d.n < MIN_PER_PARTY || r.n < MIN_PER_PARTY) return { enough: false, findings };
  const ratio = Math.max(d.avgWords, r.avgWords) / Math.max(1, Math.min(d.avgWords, r.avgWords));
  if (ratio > DRIFT.lengthRatio) findings.push(`Length: summaries of ${d.avgWords > r.avgWords ? "Democratic" : "Republican"}-sponsored bills average ${Math.round((ratio - 1) * 100)}% longer (${d.avgWords} vs ${r.avgWords} words).`);
  const hi = Math.max(d.tonePer100, r.tonePer100), lo = Math.min(d.tonePer100, r.tonePer100);
  if (hi - lo > DRIFT.tonePer100Gap && hi > DRIFT.toneRatio * Math.max(lo, 0.01)) findings.push(`Tone words: ${d.tonePer100 > r.tonePer100 ? "Democratic" : "Republican"}-sponsored bills get ${hi} evaluative words per 100 vs ${lo}.`);
  if (Math.abs(d.forShare - r.forShare) > DRIFT.balanceGap) findings.push(`For/against balance differs: the case for takes ${Math.round(d.forShare * 100)}% of the argument words on Democratic-sponsored bills vs ${Math.round(r.forShare * 100)}% on Republican-sponsored bills.`);
  for (const [g, s] of [["Democratic", d], ["Republican", r]] as const) if (s.forShare < DRIFT.balanceLow || s.forShare > DRIFT.balanceHigh) findings.push(`${g}-sponsored bills: the case for takes ${Math.round(s.forShare * 100)}% of the argument words (expected 42–58%).`);
  return { enough: true, findings };
}

/** A random sample of about `fraction` of the ids (at least one when any exist). */
export function sampleFraction<T>(items: readonly T[], fraction: number, rand: () => number = Math.random): T[] {
  const n = items.length ? Math.max(1, Math.round(items.length * fraction)) : 0, a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** Failure messages grouped into patterns (quotes and numbers stripped), for fixing the generator. */
export function patternOf(message: string) { return message.replace(/"[^"]*"/g, "\"…\"").replace(/\d+(\.\d+)?/g, "N").replace(/\s+/g, " ").trim(); }
