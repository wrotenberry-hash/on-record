/**
 * The bill's own dials (owner, 20 Nov 2026, source c): "numbers, dates, thresholds, who is covered".
 *
 * Code finds them; the model only puts them into plain words afterwards. Every candidate carries a quote cut straight
 * out of the section's text, so the quote is in the section by construction, and the value (the number, date or
 * limit itself) is inside the quote. Nothing here proposes a different number: the menu offers a direction only.
 * Pure: no imports.
 */
export type DialKind = "amount" | "percent" | "count" | "duration" | "date" | "age" | "coverage";
export type DialCandidate = {
  id: string; kind: DialKind; sectionNum: string; heading: string;
  /** The number, date or limit as printed ("$100,000,000", "180 days", "2029"); for coverage, the defined term or the opening words. */
  value: string;
  /** The clause that holds it, word for word from the section (whitespace collapsed). */
  quote: string;
  /** A wider stretch of the same section, to help the writer understand the quote. Never shown, never stored. */
  context: string;
};

/** The one form text is matched in: every run of whitespace (non-breaking spaces too) becomes one space. Case and punctuation are untouched. */
export const squash = (s: string) => s.replace(/[\s ]+/g, " ").trim();

const WORD_NUM = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|eighteen|twenty|thirty|forty|forty-five|sixty|ninety";
const MONTH = "January|February|March|April|May|June|July|August|September|October|November|December";
const NUM = "\\d[\\d,]*(?:\\.\\d+)?";

/** Each kind's pattern. Order matters: an amount is taken before the bare number inside it, a duration before a count. */
const PATTERNS: Array<[DialKind, RegExp]> = [
  ["amount", new RegExp(`\\$\\s?${NUM}(?:\\s?(?:thousand|million|billion|trillion))?`, "g")],
  ["percent", new RegExp(`\\b(?:${NUM}|${WORD_NUM})\\s?(?:percent|per centum)\\b|\\b${NUM}%`, "gi")],
  ["age", new RegExp(`\\b(?:${NUM}|${WORD_NUM}) years of age\\b|\\b(?:age|ages|aged) (?:of )?\\d{1,3}\\b`, "gi")],
  ["duration", new RegExp(`\\b(?:${NUM}|${WORD_NUM})[- ](?:calendar |business |legislative |consecutive |fiscal )?(?:days?|weeks?|months?|years?|hours?)\\b`, "gi")],
  ["date", new RegExp(`\\b(?:${MONTH}) \\d{1,2}, \\d{4}\\b|\\bfiscal years? \\d{4}(?: (?:through|and|to) (?:fiscal year )?\\d{4})?\\b|\\b(?:through|until|before|after|by|beginning in|ending in|during) (?:calendar year |fiscal year )?(?:19|20)\\d{2}\\b`, "gi")],
  // A measured quantity: land, distance, people, units.
  ["count", new RegExp(`\\b(?:approximately |about |up to )?${NUM} (?:acres?|square (?:miles?|feet)|miles?|feet|gallons?|tons?|pounds?|megawatts?|kilowatts?|barrels?|employees|members|individuals|persons|people|students|beds|units|positions|judges|officers|agents|districts|sites|projects|grants|awards)\\b`, "gi")],
  ["count", new RegExp(`\\b(?:not (?:fewer|less|more|later|earlier) than|at least|at most|no more than|no fewer than|no less than|up to|a minimum of|a maximum of|fewer than|more than|exceeds?|exceeding|in excess of|not to exceed) (?:${NUM}|${WORD_NUM})\\b`, "gi")],
  // A bill that changes one figure in an existing law says so this way: striking ``2024'' and inserting ``2029''.
  ["date", /\binserting (?:``|“|")((?:19|20)\d{2})(?:''|”|")/g],
  ["amount", new RegExp(`\\binserting (?:\`\`|“|")(\\$${NUM})(?:''|”|")`, "g")],
];

/** Who is covered: a definition, or a sentence that says to whom the section applies or who may take part. */
const COVERAGE = /\bThe term (?:``|“|")[^'”"]{2,80}(?:''|”|") (?:means|includes|does not include)\b|\b(?:shall|does|do|shall not|does not|do not) apply (?:only )?(?:to|with respect to)\b|\b(?:is|are|shall be) eligible (?:for|to)\b|\bto be eligible (?:for|to)\b|\bshall not include\b/g;

/** A number that only points somewhere: a section, a title, a public law, a page. It is a citation, not a choice. */
const CITED_BEFORE = /(?:\b(?:sections?|subsections?|paragraphs?|subparagraphs?|clauses?|titles?|chapters?|subchapters?|parts?|subparts?|divisions?|Public Law|Pub\. L\.|U\.S\.C\.|Stat\.|C\.F\.R\.|CFR|Rule|rule|page|line|H\.R\.|S\.|H\. Res\.|Order|Circular|No\.|numbered) ?(?:\d[\dA-Za-z().–-]*(?:,? (?:and|or|through|to) )?)*|\bAct of |\bResolution |\b(?:19|20)\d{2}–|\([a-zA-Z0-9]{1,4}\) ?)$/;

function clauseAround(body: string, at: number, len: number, max = 280): { quote: string; context: string } {
  // A clause ends at a full stop, a semicolon or a colon followed by a space; quoted matter is kept whole where it fits.
  const stop = /[.;:](?= )|—/g;
  let start = 0, end = body.length, m: RegExpExecArray | null;
  while ((m = stop.exec(body))) {
    if (m.index < at) { if (!/\b(?:U\.S|Pub|No|Sec|Stat|et seq|H\.R|S)$/.test(body.slice(Math.max(0, m.index - 8), m.index)) && !/^\d/.test(body.slice(m.index + 1, m.index + 2))) start = m.index + 1; }
    else if (m.index >= at + len) { end = m.index + 1; break; }
  }
  // Leave off the run of headings a clause opens with ("(d) Survey.-- (1) In general.--Not later than ...").
  const lead = body.slice(start, at).lastIndexOf(".--");
  if (lead >= 0) start = start + lead + 3;
  let from = start, to = end;
  if (to - from > max) {
    // Too long to quote whole: keep the value in the middle and cut on word boundaries (still word for word).
    from = Math.max(start, at - Math.floor((max - len) / 2)); to = Math.min(end, from + max);
    const sp = body.indexOf(" ", from); if (from > start && sp >= 0 && sp < at) from = sp + 1;
    const ep = body.lastIndexOf(" ", to); if (to < end && ep > at + len) to = ep;
  }
  const ctxFrom = Math.max(0, from - 240), ctxTo = Math.min(body.length, to + 240);
  return { quote: body.slice(from, to).trim(), context: body.slice(ctxFrom, ctxTo).trim() };
}

const RANK: Record<DialKind, number> = { amount: 0, percent: 1, count: 2, age: 3, duration: 4, date: 5, coverage: 6 };

export type DialSection = { num: string; heading: string; body: string };

/**
 * The candidates in a bill's sections, most telling first. Section 1 and any "short title", "table of contents" or
 * "definitions-free" housekeeping section are skipped; so are numbers that are citations. At most `perSection` from one
 * section and `max` in all, and never two candidates quoting the same clause.
 */
export function findDials(sections: readonly DialSection[], opts: { max?: number; perSection?: number } = {}): DialCandidate[] {
  const max = opts.max ?? 10, perSection = opts.perSection ?? 3, found: Array<DialCandidate & { order: number }> = [];
  sections.forEach((s, si) => {
    if (/short title|table of contents/i.test(s.heading)) return;
    const body = squash(s.body), taken: Array<[number, number]> = [], here: Array<DialCandidate & { order: number }> = [];
    const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
    const add = (kind: DialKind, at: number, len: number, value: string) => {
      if (overlaps(at, at + len)) return;
      const before = body.slice(Math.max(0, at - 40), at);
      if (kind !== "coverage" && CITED_BEFORE.test(before)) return;
      // "fiscal year 2027" inside "the Act of 2027" style names, and a year standing alone as a law's name, are not choices.
      if (kind === "duration" && /^(?:one|1)[- ]year$/i.test(value) && /\bfiscal\b/i.test(before)) return;
      // In a subsection's heading ("(a) Retirees With Fewer Than 20 Years of Service.--"): the same value follows in the text itself.
      const ahead = body.slice(at + len, at + len + 160), dash = ahead.indexOf(".--");
      if (dash >= 0 && !/[.;:] /.test(ahead.slice(0, dash))) return;
      // The date printed on a map or a report names that document; it is not something the bill sets.
      if (kind === "date" && /\b(?:dated|entitled|numbered|published on|issued on|signed on|as of) ?$/.test(before)) return;
      const { quote, context } = clauseAround(body, at, len);
      // The clerk's note at the end of a passed bill ("Passed the House of Representatives November 12, 2026.") is not the bill.
      if (/^(?:Passed the (?:House of Representatives|Senate)|Attest:)/.test(quote)) return;
      if (quote.length < 20 || !quote.includes(value)) return;
      taken.push([at, at + len]);
      here.push({ id: "", kind, sectionNum: s.num, heading: s.heading, value, quote, context, order: si * 1e6 + at });
    };
    for (const [kind, re] of PATTERNS) {
      re.lastIndex = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(body))) {
        const value = (m[1] ?? m[0]).trim(), at = m[1] ? m.index + m[0].indexOf(m[1]) : m.index;
        add(kind, at, value.length, value);
      }
    }
    COVERAGE.lastIndex = 0; let c: RegExpExecArray | null;
    while ((c = COVERAGE.exec(body))) {
      // A definition is a choice about who is covered only when it draws a line (who, that, which, only, a number);
      // one that just gives a name ("The term ``Secretary'' means the Secretary of the Interior") is not.
      if (/^The term/.test(c[0]) && !/\b(?:who|that|which|only|whose|if|unless|except|other than|not)\b|\d/.test(body.slice(c.index + c[0].length, c.index + c[0].length + 220).split(/\. (?=[A-Z(])/)[0])) continue;
      add("coverage", c.index, c[0].length, c[0].trim());
    }
    // One candidate per clause: the most telling kind wins.
    const byQuote = new Map<string, DialCandidate & { order: number }>();
    for (const d of here.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.order - b.order)) if (!byQuote.has(d.quote)) byQuote.set(d.quote, d);
    found.push(...[...byQuote.values()].slice(0, perSection));
  });
  // Across the bill: amounts and percentages first, then the rest in the order they appear; then back into reading order.
  const picked = found.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.order - b.order).slice(0, max).sort((a, b) => a.order - b.order);
  return picked.map((d, i) => ({ id: `d${i + 1}`, kind: d.kind, sectionNum: d.sectionNum, heading: d.heading, value: d.value, quote: d.quote, context: d.context }));
}

/** The words a reader sees for "up" and "down" on each kind of dial. */
export const DIRECTION_WORDS: Record<DialKind, { up: string; down: string }> = {
  amount: { up: "a higher amount", down: "a lower amount" }, percent: { up: "a higher percentage", down: "a lower percentage" },
  count: { up: "a higher number", down: "a lower number" }, age: { up: "a higher age", down: "a lower age" },
  duration: { up: "a longer time", down: "a shorter time" }, date: { up: "a later date", down: "an earlier date" },
  coverage: { up: "more people or things covered", down: "fewer people or things covered" },
};
