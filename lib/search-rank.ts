/**
 * Round B plain-English search: ranking with typo tolerance. Pure, no imports;
 * tested in tests/search.test.mjs. The same scoring applies to every member and
 * bill regardless of party.
 */
export type Doc = { kind: "bill" | "member" | "issue"; id: string; title: string; extra?: string; label?: string; href: string; meta?: string };

const STOP = new Set(["the", "a", "an", "of", "for", "and", "to", "in", "on", "act", "bill", "about", "is", "what", "who", "my"]);
export function tokens(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(t => t && !STOP.has(t));
}

/** Damerau-Levenshtein distance, stopping early above max. */
export function editDistance(a: string, b: string, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const allowed = (t: string) => (t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0);
/** 3 exact, 2 prefix (3+ letters), 1 within the typo allowance, 0 no match. */
function tokenScore(q: string, words: string[]) {
  let best = 0;
  for (const w of words) {
    if (w === q) return 3;
    if (q.length >= 3 && w.startsWith(q)) best = Math.max(best, 2);
    else if (allowed(q) && editDistance(q, w, allowed(q)) <= allowed(q)) best = Math.max(best, 1);
  }
  return best;
}

const BILL_RE = /^\s*(h\.?\s*r\.?|hr|s\.?|h\.?\s*j\.?\s*res\.?|hjres|s\.?\s*j\.?\s*res\.?|sjres|h\.?\s*res\.?|hres|s\.?\s*res\.?|sres|h\.?\s*con\.?\s*res\.?|hconres|s\.?\s*con\.?\s*res\.?|sconres)\s*(\d{1,5})\s*$/i;
/** "hr 2102", "H.R.2102", "s 45" → { billType, number }. */
export function parseBillNumber(q: string) {
  const m = q.match(BILL_RE);
  if (!m) return null;
  const type = m[1].toLowerCase().replace(/[.\s]/g, "");
  return { billType: type, number: Number(m[2]) };
}

/** Ranked results. Every query word must match (exactly, as a prefix, or within one or two typos). */
export function rank(query: string, docs: Doc[], limit = 30) {
  const bn = parseBillNumber(query);
  if (bn) {
    const hits = docs.filter(d => d.kind === "bill" && d.id.endsWith(`-${bn.billType}-${bn.number}`));
    if (hits.length) return hits.map(d => ({ ...d, score: 100 }));
  }
  const q = tokens(query);
  if (!q.length) return [];
  const scored = docs.map(d => {
    const words = tokens(`${d.title} ${d.extra ?? ""} ${d.label ?? ""}`);
    const titleWords = tokens(d.title);
    let total = 0;
    for (const t of q) { const s = tokenScore(t, words); if (!s) return null; total += s + (tokenScore(t, titleWords) === 3 ? 1 : 0); }
    const kindBoost = d.kind === "issue" ? 2 : d.kind === "member" ? 1 : 0;
    return { ...d, score: total / q.length + kindBoost };
  }).filter((x): x is Doc & { score: number } => !!x);
  return scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/** Everyday words that point at one of the 14 issues. */
export const ISSUE_WORDS: Record<string, string> = {
  "health-care": "medicare medicaid insurance hospital doctors drugs prescription obamacare aca health care",
  "taxes": "irs tax taxes income tariff deduction credit",
  "economy-jobs": "jobs wages employment business trade economy labor unions minimum wage",
  "cost-of-living-housing": "rent housing mortgage prices inflation groceries cost living affordable",
  "education": "schools college student loans teachers education tuition",
  "immigration": "border visa asylum citizenship deportation immigrants immigration",
  "public-safety-crime": "police crime prison justice drugs fentanyl safety courts",
  "guns": "firearms gun guns rifles background checks second amendment",
  "abortion": "abortion reproductive pregnancy roe contraception",
  "energy-environment": "climate oil gas solar wind emissions epa environment energy electricity",
  "defense-veterans": "military army navy defense veterans va troops pentagon",
  "elections-government": "voting elections ballots congress federal government ethics census",
  "tech-privacy": "internet privacy data ai artificial intelligence social media broadband technology",
  "agriculture-rural": "farm farmers farming crops rural agriculture food snap",
};
