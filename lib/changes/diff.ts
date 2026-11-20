/**
 * Differences between two versions of a bill (owner, 20 Nov 2026, source b): "House vs Senate, introduced vs
 * committee version". Code finds the passages that differ and quotes each version word for word; the model only puts
 * the difference into plain words afterwards. The two choices are always "keep this version's wording" and "go back
 * to the other version's wording": nothing is offered that neither version says. Pure: relative imports only.
 */
import { squash } from "./dials.ts";

export type DiffSection = { num: string; heading: string; body: string };
export type DiffCandidate = {
  id: string; sectionNum: string; heading: string;
  /** Words from the newer version's section (null when the newer version dropped the passage). */
  quote: string | null;
  /** Words from the older version (null when the newer version added the passage). `otherSectionNum` is its section there. */
  otherQuote: string | null; otherSectionNum: string | null;
  what: "changed" | "added" | "removed";
  context: string;
};

/** Sentences and list items of a section, each a word-for-word slice of its squashed text. */
export function passages(body: string): string[] {
  const t = squash(body), out: string[] = [];
  let from = 0;
  // A passage ends at a full stop or semicolon before a new sentence, list item or quoted item.
  const stop = /(?:[.;]|--)(?:''|”|")?(?= (?:\(|``|“|[A-Z]))/g;
  let m: RegExpExecArray | null;
  while ((m = stop.exec(t))) {
    if (/\b(?:U\.S|Pub|No|Sec|Stat|H\.R|S|et seq)$/.test(t.slice(Math.max(0, m.index - 8), m.index))) continue;
    const piece = t.slice(from, m.index + m[0].length).trim();
    if (piece) out.push(piece);
    from = m.index + m[0].length;
  }
  const last = t.slice(from).trim(); if (last) out.push(last);
  return out;
}

const key = (s: string) => squash(s).toLowerCase().replace(/[^a-z0-9$% ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(key(s).split(" ").filter(w => w.length > 2));
/** Shared words over the smaller side: 1 is the same passage, 0 nothing in common. */
export function likeness(a: string, b: string): number {
  const x = words(a), y = words(b); if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / Math.min(x.size, y.size);
}

const clip = (s: string, max = 420) => { const t = squash(s); if (t.length <= max) return t; const cut = t.lastIndexOf(" ", max); return t.slice(0, cut > 200 ? cut : max); };
const headKey = (h: string) => key(h).replace(/\b(?:sec|section)\b/g, "").trim();

/**
 * The passages that differ between `older` and `newer`, at most `max`, those holding a figure first. Sections are
 * matched by heading (numbers shift when a section is added), then by number. A passage is "changed" when the other
 * version has a similar one, "added" or "removed" when it has none.
 */
export function findDifferences(older: readonly DiffSection[], newer: readonly DiffSection[], opts: { max?: number } = {}): DiffCandidate[] {
  const max = opts.max ?? 6, out: Array<DiffCandidate & { weight: number }> = [];
  const usedOld = new Set<number>();
  const matchOld = (s: DiffSection) => {
    let i = older.findIndex((o, k) => !usedOld.has(k) && headKey(o.heading) === headKey(s.heading) && headKey(s.heading) !== "");
    if (i < 0) i = older.findIndex((o, k) => !usedOld.has(k) && o.num === s.num && likeness(o.body, s.body) > 0.3);
    if (i >= 0) usedOld.add(i);
    return i >= 0 ? older[i] : null;
  };
  const weigh = (s: string) => (/\$|\d/.test(s) ? 2 : 1);
  for (const s of newer) {
    if (/short title|table of contents/i.test(s.heading)) { matchOld(s); continue; }
    const o = matchOld(s);
    if (!o) { out.push({ id: "", sectionNum: s.num, heading: s.heading, quote: clip(s.body), otherQuote: null, otherSectionNum: null, what: "added", context: clip(s.body, 700), weight: 3 }); continue; }
    if (key(o.body) === key(s.body)) continue;
    const np = passages(s.body), op = passages(o.body), oldKeys = new Set(op.map(key)), newKeys = new Set(np.map(key));
    const gone = op.filter(p => !newKeys.has(key(p))), fresh = np.filter(p => !oldKeys.has(key(p)));
    const paired = new Set<number>();
    for (const p of fresh) {
      let best = -1, score = 0.5;
      gone.forEach((g, i) => { if (!paired.has(i)) { const l = likeness(p, g); if (l > score) { score = l; best = i; } } });
      if (best >= 0) paired.add(best);
      if (squash(p).length < 25) continue;
      out.push({ id: "", sectionNum: s.num, heading: s.heading, quote: clip(p), otherQuote: best >= 0 ? clip(gone[best]) : null, otherSectionNum: best >= 0 ? o.num : null,
        what: best >= 0 ? "changed" : "added", context: clip(s.body, 700), weight: weigh(p) + (best >= 0 ? 1 : 0) });
    }
    gone.forEach((g, i) => { if (!paired.has(i) && squash(g).length >= 25) out.push({ id: "", sectionNum: s.num, heading: s.heading, quote: null, otherQuote: clip(g), otherSectionNum: o.num, what: "removed", context: clip(o.body, 700), weight: weigh(g) }); });
  }
  older.forEach((o, k) => { if (!usedOld.has(k) && !/short title|table of contents/i.test(o.heading)) out.push({ id: "", sectionNum: o.num, heading: o.heading, quote: null, otherQuote: clip(o.body), otherSectionNum: o.num, what: "removed", context: clip(o.body, 700), weight: 3 }); });
  return out.sort((a, b) => b.weight - a.weight).slice(0, max).map((d, i) => ({ id: `v${i + 1}`, sectionNum: d.sectionNum, heading: d.heading, quote: d.quote, otherQuote: d.otherQuote, otherSectionNum: d.otherSectionNum, what: d.what, context: d.context }));
}
