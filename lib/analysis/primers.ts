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

  // Written 17 Nov 2026 from the agencies' own pages; they wait for the owner's approval (reviewed: false), so no page or prompt uses them yet.
  { id: "medicare", kind: "topic", title: "Medicare",
    bullets: [
      "Medicare is federal health insurance for people 65 and older, and for some younger people with disabilities or certain conditions. It covered about 69 million people in 2025.",
      "It comes in parts. Part A helps pay for hospital stays. Part B helps pay for doctor visits and other care outside a hospital. Part D helps pay for prescription drugs.",
      "People choose how to get it. One way is run by the government and works with any doctor or hospital that takes Medicare. The other is a private plan that Medicare approves, called Medicare Advantage, which bundles the parts. About half of the people in Medicare use a private plan.",
      "Workers and employers each pay a tax of 1.45 percent of wages toward hospital coverage, so most people pay no monthly price for Part A. Part B costs most people $202.90 a month in 2026. Most of the rest of the cost of Parts B and D comes from general federal funds.",
      "The officials who oversee Medicare's finances project that its hospital fund will run out of savings in 2033. The taxes still coming in would then cover 89 percent of the hospital benefits owed."],
    sources: [{ label: "Medicare.gov: the parts of Medicare", url: "https://www.medicare.gov/basics/get-started-with-medicare/medicare-basics/parts-of-medicare" },
      { label: "Medicare.gov: how Medicare is funded", url: "https://www.medicare.gov/about-us/how-is-medicare-funded" },
      { label: "Medicare.gov: what Medicare costs in 2026", url: "https://www.medicare.gov/basics/costs/medicare-costs" },
      { label: "2026 Medicare Trustees Report (people covered, taxes, the 2033 projection)", url: "https://www.cms.gov/oact/tr/2026" }],
    lawAsOf: "2026-11-17", reviewed: false, match: { text: /title XVIII of the Social Security Act|\bMedicare (?:program|beneficiar(?:y|ies)|Advantage|part [ABCD]\b|trust fund)|part [ABD] of (?:the )?Medicare/i } },

  { id: "medicaid", kind: "topic", title: "Medicaid",
    bullets: [
      "Medicaid gives free or low-cost health coverage to people with low incomes, including children, pregnant women, older adults and people with disabilities. It covered about 66 million people in July 2026.",
      "Each state runs its own Medicaid program under federal rules, so who qualifies and what is covered differ from state to state. A federal agency, the Centers for Medicare & Medicaid Services, oversees the states.",
      "The federal government and the states split the cost. For most care, the federal share is at least 50 percent and at most 83 percent of what a state spends. States where people earn less on average get a larger share.",
      "Every state must cover certain groups, such as low-income families and pregnant women. Since 2014 states may also cover adults based on low income alone, and most do. Starting January 1, 2027, certain adults must complete at least 80 hours a month of work or other approved activities to get and keep coverage.",
      "Medicaid is not the same as Medicare, the federal insurance for people 65 and older. About 12 million people have both. Medicaid pays for some things Medicare normally does not, like nursing home care."],
    sources: [{ label: "Medicaid.gov: the program", url: "https://www.medicaid.gov/medicaid" },
      { label: "Medicaid.gov: who is eligible", url: "https://www.medicaid.gov/medicaid/eligibility-policy" },
      { label: "Medicaid.gov: how it is paid for", url: "https://www.medicaid.gov/medicaid/financial-management" },
      { label: "Medicaid.gov: people covered, July 2026", url: "https://www.medicaid.gov/medicaid/program-information/medicaid-and-chip-enrollment-data/report-highlights" },
      { label: "Federal Register: the federal share for each state (the 50 and 83 percent limits)", url: "https://www.govinfo.gov/content/pkg/FR-2025-11-28/html/2025-21332.htm" },
      { label: "Medicare.gov: Medicaid and the 2027 work rule", url: "https://www.medicare.gov/basics/costs/help/medicaid" }],
    lawAsOf: "2026-11-17", reviewed: false, match: { text: /title XIX of the Social Security Act|\bMedicaid (?:program|beneficiar(?:y|ies)|eligib\w+|expansion|coverage)|State plan under title XIX/i } },

  { id: "social-security", kind: "topic", title: "Social Security",
    bullets: [
      "Social Security pays monthly income to retired workers, to workers who become disabled, and to the families of workers who have died. About 70 million people got payments in December 2025.",
      "Workers pay for it through a tax on wages: 6.2 percent from the worker and 6.2 percent from the employer. In 2026 the tax applies to the first $184,500 a person earns in the year. About 185 million workers paid it in 2025.",
      "The size of a person's monthly payment depends on what they earned while working. Retirement payments can start at 62, at a reduced amount. For people born in 1960 or later, the age for the full amount is 67.",
      "A federal agency, the Social Security Administration, runs it. The tax money goes into two funds that pay the benefits. In 2025 the program paid out $160 billion more than it took in and covered the gap from savings.",
      "The officials who oversee the funds project that the combined savings will run out in 2034. The taxes still coming in would then cover 83 percent of the benefits owed."],
    sources: [{ label: "2026 Social Security Trustees Report (people paid, taxes, the 2034 projection)", url: "https://www.govinfo.gov/content/pkg/CDOC-119hdoc163/pdf/CDOC-119hdoc163.pdf" },
      { label: "Federal Register: Social Security amounts for 2026", url: "https://www.govinfo.gov/content/pkg/FR-2025-11-03/html/2025-19763.htm" },
      { label: "26 U.S.C. 3101 (the tax on wages)", url: USC(26, "3101") },
      { label: "HealthCare.gov glossary: Social Security", url: "https://www.healthcare.gov/glossary/social-security/" }],
    lawAsOf: "2026-11-17", reviewed: false, match: { text: /title II of the Social Security Act|old-age, survivors, and disability insurance|Social Security (?:benefits?|retirement|trust funds?|Administration)|Federal Old-Age and Survivors Insurance Trust Fund/i } },
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
