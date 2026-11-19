/**
 * "Funds" where a bill only allows spending (19 Nov 2026).
 *
 * Three summaries that passed every check said in the headline or the question that a bill "funds" a program or
 * "gives" a sum (H.R. 9640, H.R. 3276, H.R. 2140). Each bill only authorizes the money: it sets how much Congress may
 * provide, and a separate spending law still has to provide it. A reader told "funds" expects the money to arrive.
 *
 * The rule fires only when both halves are in hand: the summary's own words say money is provided, and the sources
 * (the bill's text among them) speak of authorizing money and nowhere of appropriating it. A bill that does
 * appropriate says so in its own text ("there is appropriated", "is hereby appropriated"), and then the rule is silent.
 * Pure: no imports.
 */

/** Wording that tells a reader the bill itself provides money. Nouns ("federal funds", "funding levels") are not it. */
const SAYS_FUNDS: Array<[RegExp, string]> = [
  [/^\s*(?:would\s+)?(?:funds|pays for|bankrolls|finances)\b/i, "opens by saying the bill funds or pays for something"],
  [/\b(?:funds|gives|provides|sends|spends|puts|adds|delivers|awards)\s+(?:up to\s+|about\s+|nearly\s+|over\s+|more than\s+|an? (?:extra|additional)\s+)?\$\s?\d/i, "says the bill funds, gives or provides a dollar amount"],
  [/\b(?:support|oppose|favor|back)\s+(?:funding|paying for|giving\s+\$|providing\s+\$|spending\s+\$)/i, "asks about funding or paying for something"],
  [/\b(?:this bill|the bill|it)\s+(?:would\s+)?(?:funds?|pays? for)\b/i, "says the bill funds or pays for something"],
];

/** The sources speak of permission to spend. */
const AUTHORIZES = /authorized to be appropriated|authorization of appropriations|authorization level|\breauthoriz\w+|\bauthoriz\w+\s+(?:up to\s+)?\$\s?\d|\bauthoriz\w+\s+(?:the\s+)?appropriations?\b|subject to (?:the availability of )?appropriations/i;
/** The sources (or the bill) actually provide money. "There is authorized to be appropriated" does not match. */
const APPROPRIATES = /\b(?:is|are)\s+(?:hereby\s+)?appropriated\b|\bhereby\s+appropriated\b|\bmaking\s+(?:[a-z]+\s+){0,4}appropriations\b|not otherwise appropriated|\bdirect spending\b|\bmandatory (?:spending|funding)\b|\bappropriates\s+\$/i;

export type FundingFinding = { part: "headline" | "question" | "plain English"; words: string; why: string };

/** Each part of the summary that says money is provided, when the sources only authorize it. Empty when there is nothing to say. */
export function fundsWithoutMoney(parts: { headline?: string; question?: string; plainEnglish?: string }, sourceTexts: readonly string[]): FundingFinding[] {
  const all = sourceTexts.join("\n");
  if (!AUTHORIZES.test(all) || APPROPRIATES.test(all)) return [];
  const out: FundingFinding[] = [];
  const look = (part: FundingFinding["part"], text: string | undefined) => {
    const t = text?.trim() ?? "";
    if (!t) return;
    for (const [re, why] of SAYS_FUNDS) { const m = re.exec(t); if (m) { out.push({ part, words: m[0].trim(), why }); return; } }
  };
  look("headline", parts.headline); look("question", parts.question); look("plain English", parts.plainEnglish);
  return out;
}

/** One line for the writer to act on. */
export function fundingLine(f: FundingFinding): string {
  const where = f.part === "headline" ? "The headline" : f.part === "question" ? "The question" : "In plain English";
  return `${where} ${f.why} (“${f.words}”), but the sources say the bill only authorizes the money: it sets how much Congress may provide, and a later spending law must provide it. Say “allows up to …”, “extends permission to spend on …” or “keeps a program eligible for money”, not “funds”, “gives” or “pays for”.`;
}
