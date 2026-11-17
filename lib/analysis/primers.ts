/**
 * Primers (owner instruction, 17 Nov 2026): reusable, reviewed explainers that bring a reader up to speed from zero.
 *
 *  - PROCESS primers explain a special route a bill can take (cancelling an agency rule, a vote on whether to start
 *    debate, the 60-vote step in the Senate, a discharge petition). One tap away on the bill page.
 *  - TOPIC primers explain a recurring subject (health plans bought on HealthCare.gov, military retirement and
 *    veterans' disability pay …). They are given to the generator as a source ("PRIMER") so every related summary
 *    explains the subject the same way, and are linked from the page.
 *
 * Each primer is written once from official sources, must pass the same written rules as a summary (jargon list,
 * abbreviations, reading level: tests/primers.test.mjs), and is used only when `reviewed` is true, which the owner's
 * approval sets. The first five were approved by the owner on 17 Nov 2026. `lawAsOf` is the date its facts were checked; when a law on its subject is enacted, it is rechecked.
 * Pure: no imports, so the tests load it directly.
 */

export type PrimerSource = { label: string; url: string };
export type Primer = {
  id: string; kind: "process" | "topic"; title: string;
  /** 3 to 5 short bullets, from zero. */
  bullets: string[];
  sources: PrimerSource[];
  lawAsOf: string;
  /** Used on pages and in the prompt only after the owner approves it. */
  reviewed: boolean;
  /** When does this primer apply? Tested against the bill's official title, its text and its recorded actions. */
  match: { title?: RegExp; text?: RegExp; actions?: RegExp };
};

const USC = (title: number, section: string) => `https://www.govinfo.gov/link/uscode/${title}/${section}?link-type=html`;

export const PRIMERS: Primer[] = [
  { id: "cancel-agency-rule", kind: "process", title: "How Congress can cancel an agency rule",
    bullets: [
      "Federal agencies write detailed rules to carry out laws. Before a rule takes effect, the agency must send it to Congress.",
      "Congress can cancel a recent rule by passing a short measure that says the rule shall have no effect. The House and the Senate must both pass it, and it must become law.",
      "In the Senate this kind of measure moves faster than most. If a committee sits on it for 20 days, 30 senators can sign a petition to bring it out, and debate is limited to 10 hours.",
      "If it becomes law, the rule is treated as if it never took effect. The agency may not issue a nearly identical rule unless a later law allows it."],
    sources: [{ label: "5 U.S.C. 801 (what cancelling a rule does)", url: USC(5, "801") }, { label: "5 U.S.C. 802 (the fast Senate steps)", url: USC(5, "802") }],
    lawAsOf: "2026-11-17", reviewed: true, match: { title: /congressional disapproval under chapter 8 of title 5/i } },

  { id: "vote-to-start-debate", kind: "process", title: "What a vote to start debate means",
    bullets: [
      "Before the Senate can debate and vote on a measure, it first has to agree to take it up. Senators vote on that question separately.",
      "If that vote fails, the measure itself has not been voted on. It simply does not move forward that day.",
      "For a measure that cancels an agency rule, the law lets senators make the same request again later, even after it has failed once."],
    sources: [{ label: "5 U.S.C. 802(d) (the vote to take up a measure that cancels a rule)", url: USC(5, "802") }],
    lawAsOf: "2026-11-17", reviewed: true, match: { actions: /motion to proceed to (?:the )?(?:consideration of )?(?:the )?measure (?:rejected|not agreed to|agreed to)/i } },

  { id: "sixty-votes", kind: "process", title: "Why some Senate votes need 60",
    bullets: [
      "The Senate has a tradition of unlimited debate. Senators can use it to delay a vote on a bill or stop it from happening.",
      "To end debate and force a vote, three-fifths of the Senate must agree. That is 60 of the 100 senators.",
      "So a measure can have more than half the Senate behind it and still stall. A vote of 53 to 47 to end debate falls 7 short."],
    sources: [{ label: "U.S. Senate: ending debate", url: "https://www.senate.gov/about/powers-procedures/filibusters-cloture.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { actions: /cloture[^.]*\b(?:not invoked|invoked)\b/i } },

  { id: "health-plans-healthcare-gov", kind: "topic", title: "Health plans people buy for themselves on HealthCare.gov",
    bullets: [
      "People who do not get health insurance through a job or a government program can buy a private plan for themselves. They shop on HealthCare.gov, which the federal government runs for most states; some states run their own sites.",
      "About 23 million people chose one of these plans for 2026.",
      "The government helps many buyers pay. A tax credit, based on household income, lowers the monthly price. People with incomes between 100 and 400 percent of the federal poverty level (an income line the government sets each year) qualify in every state.",
      "Plans come in levels named for metals, from bronze to platinum. The levels differ in how costs are split between the plan and the buyer. A fifth kind, with low monthly prices and very high costs before it pays, is sold only to people under 30 or people who get an exemption.",
      "A federal agency, the Centers for Medicare & Medicaid Services, sets the rules and fees for these plans each year. Despite the agency's name, these plans are not part of Medicare or Medicaid."],
    sources: [{ label: "HealthCare.gov: the Marketplace", url: "https://www.healthcare.gov/glossary/health-insurance-marketplace-glossary/" },
      { label: "HealthCare.gov: premium tax credit", url: "https://www.healthcare.gov/glossary/premium-tax-credit/" },
      { label: "HealthCare.gov: plan categories", url: "https://www.healthcare.gov/choose-a-plan/plans-categories/" },
      { label: "The 2027 rule, Federal Register (enrollment figures)", url: "https://www.govinfo.gov/content/pkg/FR-2026-05-20/html/2026-10050.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { title: /Patient Protection and Affordable Care Act|Notice of Benefit and Payment Parameters/i, text: /qualified health plans?|Federally-facilitated Exchange|health insurance exchange/i } },

  { id: "military-retirement-disability-pay", kind: "topic", title: "Military retirement pay and veterans' disability pay",
    bullets: [
      "Service members normally earn monthly retirement pay after 20 years. People too badly hurt to keep serving can be medically retired sooner.",
      "Separately, the Department of Veterans Affairs pays a monthly amount to veterans whose injuries or illnesses came from their service.",
      "The law does not let most retirees collect both in full. To get the disability payment, a retiree gives up the same amount of retirement pay, dollar for dollar.",
      "Congress has made exceptions. Retirees with 20 years of service whom the department rates at least 50 percent disabled get both. Retirees hurt in combat can apply for a separate monthly payment that returns part of what they give up."],
    sources: [{ label: "38 U.S.C. 5304 and 5305 (the dollar-for-dollar rule)", url: USC(38, "5304") }, { label: "10 U.S.C. 1414 (retirees who get both)", url: USC(10, "1414") },
      { label: "10 U.S.C. 1413a (the combat-injury payment)", url: USC(10, "1413a") }],
    lawAsOf: "2026-11-17", reviewed: true, match: { text: /section 1413a|section 1414 of (?:such )?title|concurrent receipt/i } },
];

export type PrimerContext = { title: string; text: string; actions: string };

/** The primers that apply to a bill. `includeUnreviewed` is for the editor's preview and the tests only. */
export function primersFor(ctx: PrimerContext, includeUnreviewed = false): Primer[] {
  return PRIMERS.filter(p => (p.reviewed || includeUnreviewed) && ((p.match.title?.test(ctx.title) ?? false) || (p.match.text?.test(ctx.text) ?? false) || (p.match.actions?.test(ctx.actions) ?? false)));
}

export const primerById = (id: string) => PRIMERS.find(p => p.id === id) ?? null;

/** A primer as a source the generator can cite ("PRIMER"), so every related summary explains the subject the same way. */
export function primerSourceText(list: readonly Primer[]): string {
  return list.filter(p => p.kind === "topic").map(p => `${p.title}. ${p.bullets.join(" ")}`).join("\n");
}
