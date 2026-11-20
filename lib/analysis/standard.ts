import { toneFinding, type ToneVerdict } from "./tone.ts";
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

/** `when`: the term is jargon only where the summary is about that subject (an everyday word with one technical meaning). */
export type JargonTerm = { term: string; re: RegExp; plain: string; when?: RegExp };
const j = (term: string, pattern: string, plain: string, when?: RegExp): JargonTerm => ({ term, re: new RegExp(`\\b(?:${pattern})\\b`, "i"), plain, ...(when ? { when } : {}) });
/**
 * 18 Nov 2026 (H.R. 4795): "academic exchange programs" was explained as the health-plan marketplace, and the added
 * words then failed the source check three times. "Exchange" is health jargon only in a summary about health coverage.
 */
const ABOUT_HEALTH_COVERAGE = /\b(?:health (?:plans?|insurance|coverage|care|benefits?)|insur(?:ance|ers?|ed)|medicaid|medicare|affordable care act|premiums?|deductibles?|copays?|healthcare\.gov)\b/i;

export const JARGON: JargonTerm[] = [
  // Health coverage
  j("risk adjustment", "risk[- ]adjustment", "moving money from insurers with healthier customers to insurers with sicker ones"),
  j("user fee", "user fees?", "a charge insurers pay to sell plans on the government site"),
  j("parameters", "(?:payment |benefit and payment )?parameters", "the yearly rates and rules"),
  j("cost-sharing", "cost[- ]sharing", "what you pay yourself: deductibles and copays"),
  j("Basic Health Program", "basic health programs?", "state-run low-cost coverage for people who earn a little too much for Medicaid"),
  j("qualified health plan", "qualified health plans?", "a plan approved for sale on the government marketplace"),
  j("Exchange", "(?<!securities (?:and )?)(?<!stock )(?:federally[- ]facilitated |state[- ]based )?exchanges?(?! act\\b| commission\\b)", "the government marketplace where people buy health plans (HealthCare.gov in most states)", ABOUT_HEALTH_COVERAGE),
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
  // 18 Nov: one explanation for every form read badly ("enrollment (signed up; people in the plans) changes"). One per form.
  j("enrolled", "enroll(?:ed|ing|s)?", "signed up"),
  j("enrollment", "enrollments?", "the number of people signed up"),
  j("enrollees", "enrollees?", "people who signed up"),
  j("marketplace", "(?:state |federal |health insurance )?marketplaces?", "the government site where people buy health plans"),
  // Money and budgets
  j("deficit", "deficits?", "the gap between what the government spends and takes in"),
  // 18 Nov (H.R. 4219, H.R. 10326): "if appropriate" and "considers appropriate" were explained as money. The plain word
  // "appropriate" counts only as the verb with money after it ("may appropriate $10 million", "to appropriate funds").
  j("appropriations", "appropriat(?:ions?|es|ed|ing)|(?<!\\b(?:the|an|as|if|where|when|deems?|considers?|is|are|be|most|more) )appropriate(?= (?:up to |about |an additional |more |less |no |any |the |such |new |extra )?(?:\\$|money|funds?|sums?|dollars|amounts?|\\d))", "money Congress approves to be spent"),
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
  // 18 Nov: a proposed rule is not one "an agency has issued", and rulemaking is the process, not the regulation.
  j("final rule", "(?:interim )?final rules?", "a regulation an agency has issued"),
  j("proposed rule", "proposed rules?", "a regulation an agency has put forward but not yet issued"),
  j("rulemaking", "rulemakings?", "the steps an agency takes to write a regulation"),
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
  j("securities", "securities(?! (?:and )?exchange\\b| act\\b)|(?:a|an?y|each) security", "stocks, bonds and similar investments"),
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

const SMALL = new Set("a an the of to for on in at by and or that who with from is are it its their this than as be".split(" "));
const keyWords = (t: string) => (t.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(w => !SMALL.has(w)).map(w => w.replace(/(ies|es|s)$/, ""));
/** Do most of the explanation's own words follow the term within the same sentence? Then the writer explained it in running text. */
export function plainWordsNearby(text: string, from: number, plain: string): boolean {
  const rest = text.slice(from, from + 140), stop = rest.search(SENTENCE_END), near = new Set(keyWords(stop < 0 ? rest : rest.slice(0, stop)));
  const need = [...new Set(keyWords(plain))];
  return need.length >= 2 && need.filter(w => near.has(w)).length / need.length >= 0.75;
}

/** Jargon terms used without an explanation on first use. `parts` are the Analysis texts in reading order; the headline comes first. */
export function unexplainedJargon(parts: readonly string[]): Array<{ term: string; plain: string; part: number }> {
  const out: Array<{ term: string; plain: string; part: number }> = [];
  const whole = parts.join(" ");
  for (const t of JARGON) {
    if (t.when && !t.when.test(whole)) continue; // an everyday word outside its technical subject
    for (let p = 0; p < parts.length; p++) {
      const m = t.re.exec(parts[p]);
      if (!m) continue;
      // The headline has no room to explain a term: it must use the plain words.
      if (p === 0 || !(explainedAt(parts[p], m.index, m[0].length) || plainWordsNearby(parts[p], m.index + m[0].length, t.plain))) out.push({ term: m[0], plain: t.plain, part: p });
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
  Tightens: "tightening", Loosens: "loosening", Shortens: "shortening", Lengthens: "lengthening", Caps: "capping", Taxes: "taxing", Exempts: "exempting", Punishes: "punishing",
  // 20 Nov 2026: a word with an exact meaning is carried over as written. A resolution that "directs" was headlined "Requires" because "Directs" was not allowed here.
  Directs: "directing", Authorizes: "authorizing", Approves: "approving", Urges: "urging", Places: "placing", Transfers: "transferring" };

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
  // 18 Nov: "HealthCare.gov and related state sites" names the thing; only a trailing "and related" or an empty noun is filler.
  [/\brelated (?:provisions|matters|purposes|requirements|agencies|issues|items|activities)\b|\band related(?=\s*(?:[.,;:)]|$))/i, "\"and related matters\""],
];

export function fillerIn(text: string): string[] { return [...new Set(FILLER.filter(([re]) => re.test(text)).map(([, label]) => label))]; }

/** A concrete fact: a number, a dollar amount, a percentage, a date or a count of people. */
export const HAS_SPECIFIC = /\b(?:first|last) day of\b|\b(?:days?|months?|years?) after (?:it|the bill|the law|enactment|this)\b|\$\s?\d|\d[\d,.]*\s?(?:%|percent|million|billion|thousand|days?|months?|years?|people|states?|votes?)|\b(?:19|20)\d{2}\b|\b\d{1,3}(?:,\d{3})+\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b\d+[–-]\d+\b/;

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
export type JudgeResult = { whatItDoes: Verdict; whoIsAffected: Verdict; dailyLifeChange: Verdict; arguments: ArgumentVerdict[]; tone?: ToneVerdict };

/** An answer so general it could describe many bills, or an admission the note did not say. */
export const VAGUE_ANSWER = /\b(?:it|this|the bill|the note) (?:changes|updates|affects|is about|deals with|has to do with) (?:some|certain|various|the|a few)? ?(?:rules|things|stuff|laws|policies|regulations|standards)\b\.?$|\b(?:doesn'?t|does not|didn'?t|did not) say\b|\bnot (?:sure|clear)\b|\bunclear\b|\bi (?:don'?t|do not) know\b|\bno idea\b|\bhard to (?:say|tell)\b|\bsomething (?:about|to do with)\b/i;

/**
 * What an average adult knows from school and daily life. A reader flag on one of these is ignored; everything else
 * (agencies, programs, laws, procedures, legal, financial and medical terms, abbreviations) counts.
 */
export const COMMON_KNOWLEDGE = new Set(("congress house senate senator senators representative representatives lawmaker lawmakers member members president government federal state states " +
  "bill bills law laws rule rules vote votes voted voting voter voters election elections ballot tax taxes taxpayer taxpayers stock stocks share shares company companies " +
  "insurance plan plans coverage doctor doctors retirement retiree retirees veteran veterans military troops disability pay payment payments income cost costs budget debt " +
  "photo id identification passport license mail spouse spouses children dependent court courts judge police school schools job jobs worker workers employer employers " +
  // 18 Nov: the reader model listed these as "not understood" in four tests each while answering correctly about them.
  "tribal tribe tribes grant grants loan loans rebate rebates penalty penalties fine fines fraud calendar committee committees agency agencies city cities county counties " +
  // 20 Nov 2026 (fix D, owner: "Yes to fixes A through E"): summaries were stopped because the test reader listed these everyday things.
  "visa visas september 11 9/11 speed camera cameras chaplain chaplains embassy embassies college colleges university universities bank banks airport airports " +
  "weather storm storms terrorism terrorist attack attacks trial lawsuit prison prisons jail border borders immigration citizen citizens citizenship " +
  // 20 Nov 2026, later: the briefing's test reader listed "United States Armed Forces" and "Iran" as names it was not told about.
  // The armed forces, a war and the countries in the news are things an adult knows.
  "armed forces army navy marines soldier soldiers war wars ally allies country countries nation nations " +
  "iran iraq russia china israel ukraine mexico canada afghanistan syria korea cuba venezuela japan germany france britain england india pakistan egypt turkey taiwan europe").split(" "));
export function isCommonKnowledge(flag: string): boolean {
  const bare = flag.toLowerCase().replace(/\(.*?\)/g, " ").replace(/["“”'’.,:;]/g, " ").trim();
  const t = bare.replace(/\bunited states\b/g, " ").replace(/\b(?:the|a|an|of|in|for|to|and|or|federal|health|u s|us)\b/g, " ").trim().split(/\s+/).filter(Boolean);
  // 18 Nov: "federal" on its own left nothing to look up, so it was counted as a word the reader did not know.
  if (!t.length) return bare.length > 0;
  return t.length <= 3 && t.every(w => COMMON_KNOWLEDGE.has(w) || COMMON_KNOWLEDGE.has(w.replace(/s$/, "")));
}

/** "It doesn't say." as the whole answer: the reader could not answer from the text. */
const NO_ANSWER = /^\W*(?:it|that|the (?:note|page|text))\s+(?:doesn'?t|does not|didn'?t|did not)\s+say\b/i;
/**
 * 17 Nov, first runs with the stronger writer: a reader who answered correctly and then added "the note does not say
 * anything more" was counted as unable to answer, and so was one who correctly repeated that "the records do not say
 * what fee would apply instead". An answer fails as "could not answer" only when it is empty, a few words, opens with
 * "It doesn't say", or hedges and the check against the sources did not find it correct.
 */
export function couldNotAnswer(answer: string, verdict: Verdict, minWords: number): boolean {
  const a = answer.trim();
  const n = a.split(/\s+/).length;
  // A short hedge ("Not sure, something about health care.") fails whatever the second check says; a full answer with a hedge in it passes when it was found correct.
  return !a || n < minWords || NO_ANSWER.test(a) || (VAGUE_ANSWER.test(a) && (n < 14 || verdict.verdict !== "correct"));
}

/** A flag that names real jargon: a term on the jargon list, an abbreviation, or a code such as "403(b)". */
export function looksLikeJargon(flag: string): boolean {
  return JARGON.some(t => t.re.test(flag)) || /\b[A-Z]{2,}\b/.test(flag) || /\d/.test(flag);
}

/** Does the note explain the flagged term where it first stands (in parentheses, or ", which is …", allowing the noun it describes: "403(b) plans, which are …")? */
export function explainedInNote(flag: string, note: string): boolean {
  // "401(k)" and "403(b)" carry their own brackets; they are not an explanation of the word before them.
  note = note.replace(/\d\([a-z]\)/gi, m => `${m[0]}_${m[2]}_`); flag = flag.replace(/\d\([a-z]\)/gi, m => `${m[0]}_${m[2]}_`);
  const at = note.toLowerCase().indexOf(flag.toLowerCase().trim());
  if (at < 0) return false;
  const end = at + flag.trim().length, next = /^\s+[\w'’-]+/.exec(note.slice(end))?.[0].length ?? 0;
  return explainedAt(note, at, flag.trim().length) || (next > 0 && explainedAt(note, at, flag.trim().length + next));
}

/**
 * Which reader flags count as failures. The reader model is told to be honest, not polite, and lists words it plainly
 * understood ("combat-injured", "HealthCare.gov", "pooled") beside real jargon. A flag counts when it is real jargon the
 * note does not explain, or when the reader also got an answer wrong or vague (so the word may be why). The name of a
 * website is not jargon. Everything else is kept in the record as a note, not a failure.
 */
export function countedFlags(flags: readonly string[], note: string, allCorrect: boolean): string[] {
  return [...new Set(flags.map(w => w.trim()).filter(w => w && !/^(?:none|n\/a|nothing|no words?)\.?$/i.test(w) && !isCommonKnowledge(w)))]
    .filter(w => !/\.(?:gov|com|org)$/i.test(w) && !explainedInNote(w, note) && (looksLikeJargon(w) || !allCorrect));
}

export function readerTestResult(reader: ReaderAnswers, judge: JudgeResult, note = "", page = ""): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const q: Array<[string, string, Verdict]> = [["What does this bill do?", reader.whatItDoes, judge.whatItDoes], ["Who is affected and how?", reader.whoIsAffected, judge.whoIsAffected],
    ["What would change in daily life?", reader.dailyLifeChange, judge.dailyLifeChange]];
  for (const [question, answer, v] of q) {
    const a = answer.trim();
    if (couldNotAnswer(a, v, 5)) reasons.push(`A reader given only the headline and plain-English part could not answer "${question}" (they said: "${a.slice(0, 160)}"). Say it concretely.`);
    else if (v.verdict === "wrong") reasons.push(`A reader got "${question}" wrong. They said: "${a.slice(0, 160)}". The sources say otherwise: ${v.why.slice(0, 220)}`);
    else if (v.verdict === "vague") reasons.push(`A reader's answer to "${question}" was too vague to be useful ("${a.slice(0, 160)}"): ${v.why.slice(0, 220)}`);
  }
  // A model asked to be honest will list "Congress" and "stock". Those are everyday knowledge, not jargon, and are not failures.
  const words = countedFlags(reader.wordsNotUnderstood, note, q.every(([, , v]) => v.verdict === "correct"));
  if (words.length) reasons.push(`A reader did not understand: ${words.slice(0, 8).map(w => `"${w}"`).join(", ")}. Replace each with everyday words or explain it in parentheses.`);
  for (const a of judge.arguments) if (!a.supported) reasons.push(`The case ${a.side} argument ${a.index + 1} is not supported by the source it cites: ${a.why.slice(0, 220)} Use a reason that person or body actually gave, or leave the side empty.`);
  // Owner, 18 Nov 2026 (point 7): tone is part of the average-reader test. `page` is everything the readers saw.
  const tone = toneFinding(judge.tone, page || note);
  if (tone) reasons.push(tone);
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

/**
 * One change. `label` names the thing that changes ("The most one person can owe for care in a year").
 * `before` is used when the bill acts on a recent rule or law: what the old rule was, before the new one (owner
 * review, 17 Nov: "I didn't even know what the new rule was, what the old rule was, or what it changed").
 */
export type ChangeRow = { label?: string; before?: string; today: string; ifPassed: string; source: string };

/**
 * "It raises the most some buyers can owe" tells the reader nothing: from what, to what? A sentence that says
 * something is raised, cut, lowered or extended must carry the number.
 */
// Only when the subject is the rule or bill itself ("it also raises …"), not a description of how something works ("a tax credit that lowers the price").
const CHANGE_VERB = /\b(?:rule|bill|law|act|it|resolution|measure|agency|change|plan)\s+(?:also\s+|now\s+|would\s+)?(?:raises?|raised|cuts?|lowers?|lowered|increases?|increased|reduces?|reduced|expands?|expanded|extends?|extended|shortens?|lengthens?|tightens?|loosens?|doubles?|halves?)\s+(?:the|a|an|some|its|their|how|what)\b/i;
export function unquantifiedChanges(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+/).map(x => x.trim()).filter(x => CHANGE_VERB.test(x) && !/\d/.test(x)).map(x => x.slice(0, 90));
}

/** A rule flip is concrete without a number: may / may not, must / need not, allowed / banned. */
const CONTRAST = /\b(?:may|can|could|must|have to|has to|need|allowed|required|banned|barred|legal|illegal|no law|no limit|no rule|cannot|not)\b/i;
const VAGUE_ROW = /\b(?:some|certain|various|several|a number of|other|different|new|updated|revised|additional)\s+(?:rules|changes|provisions|requirements|standards|policies|limits|conditions|terms)\b|\b(?:would|will) (?:change|be changed|be updated|be affected|differ)\b\.?$|^(?:n\/?a|none|same|unchanged|no change|not applicable|status quo)\.?$/i;

// 20 Nov 2026 (fix A): some bills change a place or a thing, not a figure (S. 32: where a federal court may sit). A row
// is concrete when one side names a place, body or thing by its proper name that the other side does not.
const properNames = (text: string) => new Set(text.split(/(?<=[.!?;:])\s+/).flatMap(sentence => sentence.trim().split(/\s+/).slice(1)).map(w => w.replace(/^[("“‘']+|[)"”’',.;:!?]+$/g, "")).filter(w => /^[A-Z][a-z]{2,}/.test(w)));
function namesADifferentThing(today: string, ifPassed: string): boolean {
  const a = properNames(today), b = properNames(ifPassed);
  return [...b].some(w => !a.has(w)) || [...a].some(w => !b.has(w));
}

/** Why a "Today → If this passes" row is too vague to keep, or null when it is concrete. */
export function vagueChangeRow(row: ChangeRow): string | null {
  const t = `${row.before?.trim() ? `${row.before.trim()} ` : ""}${row.today.trim()}`.trim(), p = row.ifPassed.trim();
  if (t.split(/\s+/).length < 4 || p.split(/\s+/).length < 4) return "each side needs a full statement";
  if (t.toLowerCase() === p.toLowerCase()) return "both sides say the same thing";
  if (VAGUE_ROW.test(t) || VAGUE_ROW.test(p) || fillerIn(`${t} . ${p}`).length) return "it does not say exactly what changes";
  if (!HAS_SPECIFIC.test(`${t} ${p}`) && !(CONTRAST.test(t) || CONTRAST.test(p)) && !namesADifferentThing(t, p)) return "it has no number, date or clear rule (may / may not, must / need not)";
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
    if (couldNotAnswer(a, v, 6)) reasons.push(`A reader given the page (through "Who it affects") could not answer "${question}" (they said: "${a.slice(0, 160)}"). Explain it from zero, concretely.`);
    else if (v.verdict === "wrong") reasons.push(`A reader of the page got "${question}" wrong. They said: "${a.slice(0, 160)}". The sources say otherwise: ${v.why.slice(0, 220)}`);
    else if (v.verdict === "vague") reasons.push(`A reader of the page answered "${question}" too vaguely ("${a.slice(0, 160)}"): ${v.why.slice(0, 220)}`);
  }
  return { passed: reasons.length === 0, reasons };
}
