/**
 * The writing standard for every Analysis section (owner instruction, 17 Nov 2026), as rules a machine can check.
 * Pure: no database, no network, no model. Tested in tests/standard.test.mjs.
 *
 *   1. Assume zero familiarity with the bill, the agency or the subject.
 *   2. Headline: at most 15 words, a clear verb first, the everyday thing people know, no acronyms.
 *   3. In plain English: at most 3 sentences a reader could repeat to a friend.
 *   4. Specifics over generalities: no filler; concrete facts from the sources, or say plainly they are not there.
 *   5. Jargon: every term on the list is replaced by plain words or explained in parentheses on first use.
 *   6. Case for and against: reasons and stakes from the official record, not the mechanics again.
 *   7. The page is layered: headline, plain English, "Explain more", sources.
 */

// ───────────── 5. The jargon list. Add a term whenever a review or the reader test finds a new one. ─────────────

export type JargonTerm = { term: string; re: RegExp; plain: string };
const j = (term: string, pattern: string, plain: string): JargonTerm => ({ term, re: new RegExp(`\\b(?:${pattern})\\b`, "i"), plain });

export const JARGON: JargonTerm[] = [
  // Health coverage
  j("risk adjustment", "risk[- ]adjustment", "moving money from insurers with healthier customers to insurers with sicker ones"),
  j("user fee", "user fees?", "a charge insurers pay to sell plans on the government site"),
  j("parameters", "(?:payment |benefit and payment )?parameters", "the yearly rates and rules"),
  j("cost-sharing", "cost[- ]sharing", "what you pay yourself: deductibles and copays"),
  j("Basic Health Program", "basic health programs?", "state-run low-cost coverage for people who earn a little too much for Medicaid"),
  j("qualified health plan", "qualified health plans?", "a plan approved for sale on the government marketplace"),
  j("Exchange", "(?:federally[- ]facilitated |state[- ]based )?exchanges?", "the government marketplace where people buy health plans (HealthCare.gov in most states)"),
  j("issuer", "issuers?", "insurance company"),
  j("essential health benefits", "essential health benefits?", "the services every plan must cover"),
  j("catastrophic plan", "catastrophic (?:plans?|coverage)", "a plan with low monthly payments and a very high deductible"),
  j("bronze plan", "bronze (?:plans?|level)", "the marketplace plan level with the lowest monthly payments and highest out-of-pocket costs"),
  j("hardship exemption", "hardship exemptions?", "permission to buy a cheaper plan because other coverage is unaffordable"),
  j("actuarial value", "actuarial value", "the share of medical costs a plan pays on average"),
  j("premium tax credit", "premium tax credits?", "federal help that lowers the monthly payment for a marketplace plan"),
  j("defrayal", "defray(?:al|s|ed|ing)?", "paying the cost"),
  j("open enrollment", "open enrollment", "the yearly sign-up period"),
  j("special enrollment period", "special enrollment periods?", "a chance to sign up outside the yearly sign-up period"),
  j("premium", "premiums?(?! tax credit)", "the monthly price of a plan"),
  j("enrolled", "enroll(?:ed|ees?|ment|ing|s)?", "signed up; people in the plans"),
  j("marketplace", "(?:state |federal |health insurance )?marketplaces?", "the government site where people buy health plans"),
  // Money and budgets
  j("deficit", "deficits?", "the gap between what the government spends and takes in"),
  j("appropriations", "appropriat(?:ions?|es?|ed|ing)", "money Congress approves to be spent"),
  j("authorization", "authoriz(?:ation|ations|es) of appropriations|reauthoriz(?:es?|ation|ed|ing)", "permission for a program to exist and be funded"),
  j("reconciliation", "(?:budget )?reconciliation", "a budget process that lets the Senate pass a bill with 51 votes instead of 60"),
  j("mandatory spending", "mandatory spending|direct spending", "spending that happens automatically under existing law"),
  j("discretionary spending", "discretionary spending", "spending Congress decides each year"),
  j("rescission", "rescissions?|rescind(?:s|ed|ing)?", "taking back money already approved"),
  j("continuing resolution", "continuing resolutions?", "a stopgap law that keeps the government funded at current levels"),
  j("fiscal year", "fiscal years?", "the government's budget year, which starts October 1"),
  j("offset", "offsets?", "a cut made to one payment because of another"),
  // How Congress works
  j("cloture", "cloture", "a vote to end debate, which needs 60 senators"),
  j("filibuster", "filibusters?", "delaying a vote by extending debate"),
  j("motion to proceed", "motions? to proceed", "a vote on whether to take a bill up at all"),
  j("discharge petition", "discharge(?:d)? (?:petitions?|by petition)|motions? to discharge", "a way to bring a bill out of committee without the committee's vote"),
  j("Congressional Review Act", "congressional review act", "a law that lets Congress cancel a recent agency rule by majority vote"),
  j("joint resolution", "joint resolutions?", "a measure that becomes law like a bill"),
  j("disapproval", "(?:resolution of |congressional )disapproval|disapprov(?:es|ed|ing|al)", "cancel"),
  j("suspension of the rules", "suspension of the rules|under suspension", "a fast House process that needs a two-thirds vote"),
  j("unanimous consent", "unanimous consent", "agreement with no senator objecting"),
  j("markup", "mark-?ups?", "a committee meeting to change and vote on a bill"),
  j("conference committee", "conference (?:committee|report)", "a House and Senate group that settles the two versions"),
  j("engrossed", "engrossed|enrolled bill", "the official copy as passed"),
  j("sunset", "sunsets?", "an end date written into the law"),
  // Rules and legal language
  j("final rule", "(?:interim )?final rules?|proposed rules?|rulemaking", "a regulation an agency has issued"),
  j("promulgate", "promulgat(?:e|es|ed|ing|ion)", "issue"),
  j("codify", "codif(?:y|ies|ied|ication)", "write into law"),
  j("preempt", "pre-?empt(?:s|ed|ion|ing)?", "override state law"),
  j("pursuant to", "pursuant to", "under"),
  j("statute", "statut(?:e|es|ory)", "law"),
  j("provisions", "provisions?", "parts of the law"),
  j("affidavit", "affidavits?", "a sworn written statement"),
  j("notary", "notar(?:y|ies|ized|ization)(?:'s)?", "an official witness to a signature"),
  j("sponsor", "(?:co-?)?sponsors?", "the member who wrote the bill"),
  j("substantially the same", "substantially (?:the same|similar)", "nearly identical"),
  j("provisional ballot", "provisional ballots?", "a ballot set aside until officials confirm the voter is eligible"),
  j("fiduciary", "fiduciar(?:y|ies)", "someone legally required to act in another person's interest"),
  j("stakeholders", "stakeholders?|interested parties", "the people and groups affected"),
  // Military and veterans
  j("concurrent receipt", "concurrent receipt", "getting both payments in full at the same time"),
  j("chapter 61", "chapter 61", "medical retirement from the military"),
  j("combat-related special compensation", "combat[- ]related special compensation", "a monthly payment for retirees whose disability came from combat"),
  j("creditable service", "creditable service", "years of service that count toward retirement"),
  // Investing
  j("collective investment trust", "collective (?:investment )?trusts?(?: funds?)?", "a pooled investment fund run by a bank"),
  j("separate account", "separate accounts?", "an insurance company's investment account kept apart from its own money"),
  j("covered investment", "covered investments?", "the kinds of investments the bill restricts"),
  j("blind trust", "(?:qualified )?blind trusts?", "investments managed by someone else without the owner knowing what is held"),
  j("securities", "securit(?:y|ies)(?! number)", "stocks, bonds and similar investments"),
];

const SENTENCE_END = /[.!?](?:\s|$)/;

/** Is the term at `at` explained where it stands: parentheses right after it, or the term itself inside parentheses after plain words? */
export function explainedAt(text: string, at: number, length: number): boolean {
  const after = text.slice(at + length, at + length + 60);
  const stop = after.search(SENTENCE_END);
  const sameSentence = stop < 0 ? after : after.slice(0, stop);
  if (/^[\s"”'’s]*\(/.test(sameSentence) || /^[^()]{0,25}\(/.test(sameSentence) && !/\)/.test(sameSentence.split("(")[0])) return true;
  if (/^[\s"”'’]*,?\s*(?:which (?:is|are|means)|meaning|that is|or )/i.test(sameSentence)) return true;
  // inside parentheses: an unclosed "(" before it in the same sentence
  const before = text.slice(Math.max(0, at - 160), at);
  const open = before.lastIndexOf("("), close = before.lastIndexOf(")");
  return open > close;
}

/** Jargon terms used without an explanation on first use. `parts` are the Analysis texts in reading order; the headline comes first. */
export function unexplainedJargon(parts: readonly string[]): Array<{ term: string; plain: string; part: number }> {
  const out: Array<{ term: string; plain: string; part: number }> = [];
  for (const t of JARGON) {
    for (let p = 0; p < parts.length; p++) {
      const m = t.re.exec(parts[p]);
      if (!m) continue;
      // The headline has no room to explain a term: it must use the plain words.
      if (p === 0 || !explainedAt(parts[p], m.index, m[0].length)) out.push({ term: m[0], plain: t.plain, part: p });
      break; // only the first use needs the explanation
    }
  }
  return out;
}

// ───────────── 2. Headline ─────────────

/** Clear verbs a headline may start with, and their "-ing" form for the voting question. */
export const HEADLINE_VERBS: Record<string, string> = { Blocks: "blocking", Raises: "raising", Cuts: "cutting", Requires: "requiring", Bans: "banning", Funds: "funding",
  Lets: "letting", Allows: "allowing", Ends: "ending", Creates: "creating", Sets: "setting", Limits: "limiting", Lowers: "lowering", Extends: "extending", Stops: "stopping",
  Gives: "giving", Adds: "adding", Removes: "removing", Bars: "barring", Expands: "expanding", Restores: "restoring", Pays: "paying", Delays: "delaying", Repeals: "repealing",
  Renames: "renaming", Keeps: "keeping", Makes: "making", Changes: "changing", Cancels: "cancelling", Forces: "forcing", Speeds: "speeding", Opens: "opening", Closes: "closing",
  Doubles: "doubling", Increases: "increasing", Reduces: "reducing", Protects: "protecting", Names: "naming", Orders: "ordering", Starts: "starting", Moves: "moving",
  Tightens: "tightening", Loosens: "loosening", Shortens: "shortening", Lengthens: "lengthening", Caps: "capping", Taxes: "taxing", Exempts: "exempting", Punishes: "punishing" };

/** Acronyms an average reader does know. Everything else in capitals must be spelled out. */
export const EVERYDAY_ACRONYMS = new Set(["ID", "US", "U.S.", "TV", "DC", "D.C.", "OK", "AM", "PM"]);

export function acronymsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:[A-Z]\.){2,}|\b[A-Z]{2,6}s?\b/g)) {
    const a = m[0].replace(/s$/, "");
    if (!EVERYDAY_ACRONYMS.has(a) && !/^(?:I{1,3}|IV|VI{0,3}|IX|XI{0,3})$/.test(a)) out.add(a);
  }
  return [...out];
}

export const HEADLINE_WORDS = 15;

export function headlineProblems(headline: string): string[] {
  const out: string[] = [], h = headline.trim(), n = h.split(/\s+/).filter(Boolean).length;
  if (n > HEADLINE_WORDS) out.push(`Headline is ${n} words; the limit is ${HEADLINE_WORDS}.`);
  const first = h.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "";
  if (!HEADLINE_VERBS[first]) out.push(`Headline must start with a clear verb such as Blocks, Raises, Cuts, Requires, Bans, Funds, Lets or Ends (it starts "${first}"). Say what changes, for whom, in everyday words.`);
  const ac = acronymsIn(h);
  if (ac.length) out.push(`Headline uses the abbreviation${ac.length > 1 ? "s" : ""} ${ac.map(a => `"${a}"`).join(", ")}; use the everyday words instead.`);
  return out;
}

/** Abbreviations in the body that are never spelled out: the first use must be the bracketed one, "… (ABC)". */
export function unexplainedAcronyms(parts: readonly string[]): string[] {
  const text = parts.join("  \n");
  return acronymsIn(text).filter(a => {
    const at = text.search(new RegExp(`(?<![A-Za-z])${a.replace(/\./g, "\\.")}`));
    return at >= 0 && !(text[at - 1] === "(" || explainedAt(text, at, a.length));
  });
}

// ───────────── 4. Specifics over generalities ─────────────

export const FILLER: Array<[RegExp, string]> = [
  [/\bwould (?:affect|impact|change|address|update|revise|modify)\b[^.]{0,60}\b(?:standards|parameters|provisions|requirements|policies|programs|rules|matters)\b(?![^.]*\b(?:by|from|to|so that)\b)/i, "\"would affect … standards\" without saying how"],
  [/\b(?:some|certain|various|several|a number of|other) (?:rules|provisions|changes|requirements|standards|policies|matters|purposes)\b/i, "\"certain/various provisions\""],
  [/\band for other purposes\b/i, "\"and for other purposes\""],
  [/\b(?:technical|conforming) (?:and conforming )?(?:changes|amendments)\b/i, "\"conforming changes\""],
  [/\bpayment and program standards\b|\bprogram standards\b/i, "\"program standards\""],
  [/\bimprov(?:e|es|ing) (?:the )?implementation\b/i, "\"improve implementation\""],
  [/\b(?:changes|updates|revises|modifies|addresses) (?:some|the|several|certain)? ?(?:rules|law|laws|policies)\b(?! (?:so|by|to|for|that|on how))/i, "\"changes some rules\""],
  [/\brelated (?:provisions|matters|purposes|requirements)\b|\band related\b(?! to)/i, "\"and related matters\""],
];

export function fillerIn(text: string): string[] { return [...new Set(FILLER.filter(([re]) => re.test(text)).map(([, label]) => label))]; }

/** A concrete fact: a number, a dollar amount, a percentage, a date or a count of people. */
export const HAS_SPECIFIC = /\$\s?\d|\d[\d,.]*\s?(?:%|percent|million|billion|thousand|days?|months?|years?|people|states?|votes?)|\b(?:19|20)\d{2}\b|\b\d{1,3}(?:,\d{3})+\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b\d+[–-]\d+\b/;

// ───────────── 6. Reasons and stakes ─────────────

const words5 = (s: string) => new Set((s.toLowerCase().match(/[a-z]{5,}/g) ?? []).map(w => w.replace(/(ations?|ments?|ings?|ies|ied|ed|es|s)$/, "").slice(0, 7)));
/** Share of an argument's content words that only repeat what the bill does. A high share means mechanics, not a reason. */
export function mechanicsShare(argument: string, whatItDoes: readonly string[]): number {
  const did = words5(whatItDoes.join(" ")), arg = [...words5(argument)];
  return arg.length ? arg.filter(w => did.has(w)).length / arg.length : 0;
}
export const NO_REASONS_FOUND = "No public statement of reasons found.";

// ───────────── The average-reader test: the rules that decide pass or fail ─────────────

export type ReaderAnswers = { whatItDoes: string; whoIsAffected: string; dailyLifeChange: string; wordsNotUnderstood: string[] };
export type Verdict = { verdict: "correct" | "wrong" | "vague"; why: string };
export type ArgumentVerdict = { side: "for" | "against"; index: number; supported: boolean; why: string };
export type JudgeResult = { whatItDoes: Verdict; whoIsAffected: Verdict; dailyLifeChange: Verdict; arguments: ArgumentVerdict[] };

/** An answer so general it could describe many bills, or an admission the note did not say. */
export const VAGUE_ANSWER = /\b(?:it|this|the bill|the note) (?:changes|updates|affects|is about|deals with|has to do with) (?:some|certain|various|the|a few)? ?(?:rules|things|stuff|laws|policies|regulations|standards)\b\.?$|\b(?:doesn'?t|does not|didn'?t|did not) say\b|\bnot (?:sure|clear)\b|\bunclear\b|\bi (?:don'?t|do not) know\b|\bno idea\b|\bhard to (?:say|tell)\b|\bsomething (?:about|to do with)\b/i;

/**
 * What an average adult knows from school and daily life. A reader flag on one of these is ignored; everything else
 * (agencies, programs, laws, procedures, legal, financial and medical terms, abbreviations) counts.
 */
export const COMMON_KNOWLEDGE = new Set(("congress house senate senator senators representative representatives lawmaker lawmakers member members president government federal state states " +
  "bill bills law laws rule rules vote votes voted voting voter voters election elections ballot tax taxes taxpayer taxpayers stock stocks share shares company companies " +
  "insurance plan plans coverage doctor doctors retirement retiree retirees veteran veterans military troops disability pay payment payments income cost costs budget debt " +
  "photo id identification passport license mail spouse spouses children dependent court courts judge police school schools job jobs worker workers employer employers").split(" "));
export function isCommonKnowledge(flag: string): boolean {
  const t = flag.toLowerCase().replace(/\(.*?\)/g, " ").replace(/["“”'’.,:;]/g, " ").replace(/\b(?:the|a|an|of|in|for|to|and|or|federal|health|u s|us)\b/g, " ").trim().split(/\s+/).filter(Boolean);
  return t.length > 0 && t.length <= 3 && t.every(w => COMMON_KNOWLEDGE.has(w) || COMMON_KNOWLEDGE.has(w.replace(/s$/, "")));
}

export function readerTestResult(reader: ReaderAnswers, judge: JudgeResult): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const q: Array<[string, string, Verdict]> = [["What does this bill do?", reader.whatItDoes, judge.whatItDoes], ["Who is affected and how?", reader.whoIsAffected, judge.whoIsAffected],
    ["What would change in daily life?", reader.dailyLifeChange, judge.dailyLifeChange]];
  for (const [question, answer, v] of q) {
    const a = answer.trim();
    if (!a || VAGUE_ANSWER.test(a) || a.split(/\s+/).length < 5) reasons.push(`A reader given only the headline and plain-English part could not answer "${question}" (they said: "${a.slice(0, 160)}"). Say it concretely.`);
    else if (v.verdict === "wrong") reasons.push(`A reader got "${question}" wrong. They said: "${a.slice(0, 160)}". The sources say otherwise: ${v.why.slice(0, 220)}`);
    else if (v.verdict === "vague") reasons.push(`A reader's answer to "${question}" was too vague to be useful ("${a.slice(0, 160)}"): ${v.why.slice(0, 220)}`);
  }
  // A model asked to be honest will list "Congress" and "stock". Those are everyday knowledge, not jargon, and are not failures.
  const words = [...new Set(reader.wordsNotUnderstood.map(w => w.trim()).filter(w => w && !/^(?:none|n\/a|nothing|no words?)\.?$/i.test(w) && !isCommonKnowledge(w)))];
  if (words.length) reasons.push(`A reader did not understand: ${words.slice(0, 8).map(w => `"${w}"`).join(", ")}. Replace each with everyday words or explain it in parentheses.`);
  for (const a of judge.arguments) if (!a.supported) reasons.push(`The case ${a.side} argument ${a.index + 1} is not supported by the source it cites: ${a.why.slice(0, 220)} Use a reason that person or body actually gave, or leave the side empty.`);
  return { passed: reasons.length === 0, reasons };
}

// ───────────── Everyday names: the name people know, allowed when the source uses the official one ─────────────

/** everyday name → what the official source must contain for the everyday name to be accurate. */
export const EVERYDAY_NAMES: Array<{ everyday: RegExp; official: RegExp }> = [
  { everyday: /^HealthCare\.gov$/i, official: /federally[- ]facilitated exchange|federal platform|healthcare\.gov/i },
  { everyday: /^VA$/, official: /department of veterans affairs|title 38|veterans'? disability compensation/i },
  { everyday: /^IRS$/, official: /internal revenue (?:service|code)/i },
  { everyday: /^Pentagon$/i, official: /department of defense|secretary of defense/i },
];

// ───────────── "How it works today" → "What would change" → "Why now" (owner instruction, 17 Nov 2026) ─────────────

export type ChangeRow = { today: string; ifPassed: string; source: string };

/** A rule flip is concrete without a number: may / may not, must / need not, allowed / banned. */
const CONTRAST = /\b(?:may|can|could|must|have to|has to|need|allowed|required|banned|barred|legal|illegal|no law|no limit|no rule|cannot|not)\b/i;
const VAGUE_ROW = /\b(?:some|certain|various|several|a number of|other|different|new|updated|revised|additional)\s+(?:rules|changes|provisions|requirements|standards|policies|limits|conditions|terms)\b|\b(?:would|will) (?:change|be changed|be updated|be affected|differ)\b\.?$|^(?:n\/?a|none|same|unchanged|no change|not applicable|status quo)\.?$/i;

/** Why a "Today → If this passes" row is too vague to keep, or null when it is concrete. */
export function vagueChangeRow(row: ChangeRow): string | null {
  const t = row.today.trim(), p = row.ifPassed.trim();
  if (t.split(/\s+/).length < 4 || p.split(/\s+/).length < 4) return "each side needs a full statement";
  if (t.toLowerCase() === p.toLowerCase()) return "both sides say the same thing";
  if (VAGUE_ROW.test(t) || VAGUE_ROW.test(p) || fillerIn(`${t} . ${p}`).length) return "it does not say exactly what changes";
  if (!HAS_SPECIFIC.test(`${t} ${p}`) && !(CONTRAST.test(t) || CONTRAST.test(p))) return "it has no number, date or clear rule (may / may not, must / need not)";
  return null;
}

export const STRUCTURE_LIMITS = { todayMin: 3, todayMax: 5, todayWords: 40, changesMin: 2, changesMax: 6, rowWords: 38, whyNowWords: 50 } as const;

// ───────────── The reader test on the whole page: how it works today, what exactly changes, who is affected ─────────────

export type PageAnswers = { howItWorksToday: string; whatChanges: string; whoIsAffected: string };
export type PageVerdicts = { howItWorksToday: Verdict; whatChanges: Verdict; whoIsAffected: Verdict };

export function pageTestResult(reader: PageAnswers, judge: PageVerdicts): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const q: Array<[string, string, Verdict]> = [["How do things work today?", reader.howItWorksToday, judge.howItWorksToday], ["What exactly would change?", reader.whatChanges, judge.whatChanges],
    ["Who is affected?", reader.whoIsAffected, judge.whoIsAffected]];
  for (const [question, answer, v] of q) {
    const a = answer.trim();
    if (!a || VAGUE_ANSWER.test(a) || a.split(/\s+/).length < 6) reasons.push(`A reader given the page (through "Who it affects") could not answer "${question}" (they said: "${a.slice(0, 160)}"). Explain it from zero, concretely.`);
    else if (v.verdict === "wrong") reasons.push(`A reader of the page got "${question}" wrong. They said: "${a.slice(0, 160)}". The sources say otherwise: ${v.why.slice(0, 220)}`);
    else if (v.verdict === "vague") reasons.push(`A reader of the page answered "${question}" too vaguely ("${a.slice(0, 160)}"): ${v.why.slice(0, 220)}`);
  }
  return { passed: reasons.length === 0, reasons };
}
