/**
 * Undoing a repair that went wrong. The repair step (lib/analysis/repair.ts) explains a jargon term by adding the
 * reviewed plain words in parentheses right after it. On 18 Nov 2026 it did that to words that were not the term:
 * "a strike team agreement if appropriate (money Congress approves to be spent)" was shown to readers on H.R. 4219.
 *
 * An explanation from the list is misapplied when the words in front of it are not that term (under today's list), or
 * when the term only counts in a subject the summary is not about. Such an explanation is removed; nothing else changes.
 * Pure. Tested in tests/unrepair.test.mjs.
 */
import { JARGON } from "./standard.ts";


export function stripMisapplied(text: string, whole = text): { text: string; removed: string[] } {
  const removed: string[] = [];
  let out = text;
  for (const plain of new Set(JARGON.map(t => t.plain))) {
    const added = ` (${plain})`;
    if (!out.includes(added)) continue;
    const terms = JARGON.filter(t => t.plain === plain);
    // The subject test must not be satisfied by the explanation itself ("health plans" inside the marketplace note).
    const subject = whole.split(added).join(" ");
    let from = 0;
    for (let at = out.indexOf(added, from); at >= 0; at = out.indexOf(added, from)) {
      // Judge the term as it stood before the explanation was added: some terms depend on the words that follow ("appropriate $10 million").
      const start = Math.max(0, at - 120), before = out.slice(start, at), window = before + out.slice(at + added.length, at + added.length + 80);
      const fits = terms.some(t => (!t.when || t.when.test(subject)) && [...window.matchAll(new RegExp(t.re.source, "gi"))].some(m => m.index + m[0].length === before.length));
      if (fits) { from = at + added.length; continue; }
      removed.push(`"${/[\w'’$.-]+$/.exec(before)?.[0] ?? ""}${added}"`);
      out = out.slice(0, at) + out.slice(at + added.length);
      from = at;
    }
  }
  return { text: out, removed };
}

/** The same over every reading field of a stored summary. `get`/`set` pairs keep this free of the database's shapes. */
export function stripAll(fields: Array<{ get: () => string; set: (v: string) => void }>): string[] {
  const whole = fields.map(f => f.get()).join(" \n ");
  const removed: string[] = [];
  for (const f of fields) {
    const r = stripMisapplied(f.get(), whole);
    if (r.removed.length) { f.set(r.text); removed.push(...r.removed); }
  }
  return removed;
}

type Pt = { text: string }; type Arg = { argument: string };
export type SummaryText = { whatItDoes: Pt[]; whoItAffects: Pt[]; whatChangesForYou: string; caseFor: Arg[]; caseAgainst: Arg[]; unknowns: string[] };
export type DetailText = { plainEnglish: string; background: string | null };
export type StructureText = { howItWorksToday: Pt[]; changes: Array<{ label?: string; before?: string; today: string; ifPassed: string }>; whyNow: string };

/**
 * Cleans a whole summary in place and says what was removed. Used when a summary is read for a page (so a reader never
 * sees a misapplied explanation, whatever is stored) and by the run that corrects the stored text.
 */
export function cleanSummaryText(s: SummaryText, d: DetailText | null | undefined, st: StructureText | null | undefined): string[] {
  const field = <T,>(o: T, k: keyof T) => ({ get: () => String(o[k] ?? ""), set: (v: string) => { (o as Record<string, unknown>)[k as string] = v; } });
  return stripAll([...s.whatItDoes.map(x => field(x, "text")), ...s.whoItAffects.map(x => field(x, "text")), field(s, "whatChangesForYou"),
    ...s.caseFor.map(x => field(x, "argument")), ...s.caseAgainst.map(x => field(x, "argument")),
    ...s.unknowns.map((_, i) => ({ get: () => s.unknowns[i], set: (v: string) => { s.unknowns[i] = v; } })),
    ...(d ? [field(d, "plainEnglish"), ...(d.background ? [field(d, "background")] : [])] : []),
    ...(st ? [...st.howItWorksToday.map(x => field(x, "text")), ...st.changes.flatMap(x => [field(x, "today"), field(x, "ifPassed"), ...(x.before ? [field(x, "before")] : []), ...(x.label ? [field(x, "label")] : [])]), field(st, "whyNow")] : [])]);
}
