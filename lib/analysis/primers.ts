/**
 * Primers (owner instruction, 17 Nov 2026): reusable, reviewed explainers that bring a reader up to speed from zero.
 *
 *  - PROCESS primers explain a special route a bill can take (cancelling an agency rule, a vote on whether to start
 *    debate, the 60-vote step in the Senate, the budget route that needs only a simple majority). One tap away on the bill page.
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

  // Written 17 Nov 2026 from the agencies' own pages; approved by the owner on 17 Nov 2026 ("Explainers are approved").
  { id: "medicare", kind: "topic", title: "Medicare",
    bullets: [
      "Medicare is federal health insurance for people 65 and older, and for some younger people with disabilities or certain conditions. It covered about 69 million people in 2025.",
      "It comes in parts. Part A helps pay for hospital stays. Part B helps pay for doctor visits and other care outside a hospital. Part D helps pay for prescription drugs.",
      "People choose how to get it. One way is run by the government and works with any doctor or hospital that takes Medicare. The other is a private plan that Medicare approves, called Medicare Advantage, which combines the parts in one plan. About half of the people in Medicare use a private plan.",
      "Workers and employers each pay a tax of 1.45 percent of wages toward hospital coverage. Because of that tax, most people pay no monthly price for Part A. Part B costs most people $202.90 a month in 2026. General federal tax money pays most of the rest of Parts B and D.",
      "The officials who oversee Medicare's finances project that its hospital fund will run out of savings in 2033. The taxes still coming in would then pay for 89 percent of the hospital costs Medicare is supposed to cover."],
    sources: [{ label: "Medicare.gov: the parts of Medicare", url: "https://www.medicare.gov/basics/get-started-with-medicare/medicare-basics/parts-of-medicare" },
      { label: "Medicare.gov: how Medicare is funded", url: "https://www.medicare.gov/about-us/how-is-medicare-funded" },
      { label: "Medicare.gov: what Medicare costs in 2026", url: "https://www.medicare.gov/basics/costs/medicare-costs" },
      { label: "2026 Medicare Trustees Report (people covered, taxes, the 2033 projection)", url: "https://www.cms.gov/oact/tr/2026" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { text: /title XVIII of the Social Security Act|\bMedicare (?:program|beneficiar(?:y|ies)|Advantage|part [ABCD]\b|trust fund)|part [ABD] of (?:the )?Medicare/i } },

  { id: "medicaid", kind: "topic", title: "Medicaid",
    bullets: [
      "Medicaid gives free or low-cost health coverage to people with low incomes, including children, pregnant women, older adults and people with disabilities. It covered about 66 million people in July 2026.",
      "Each state runs its own Medicaid program under federal rules, so who qualifies and what is covered differ from state to state. A federal agency, the Centers for Medicare & Medicaid Services, oversees the states.",
      "The federal government and the states split the cost. For most care, the federal share is at least 50 percent and at most 83 percent of what a state spends. States where people earn less on average get a larger share.",
      "Every state must cover some groups, such as low-income pregnant women. A state may also cover adults who qualify only because their income is low, and most do. From January 1, 2027, those adults must, with some exceptions, do at least 80 hours a month of work or other approved activities to keep coverage.",
      "Medicaid is not the same as Medicare, the federal insurance for people 65 and older. About 12 million people have both. Medicaid pays for some things Medicare normally does not, like nursing home care."],
    sources: [{ label: "Medicaid.gov: the program", url: "https://www.medicaid.gov/medicaid" },
      { label: "Medicaid.gov: who is eligible", url: "https://www.medicaid.gov/medicaid/eligibility-policy" },
      { label: "Medicaid.gov: how it is paid for", url: "https://www.medicaid.gov/medicaid/financial-management" },
      { label: "Medicaid.gov: people covered, July 2026", url: "https://www.medicaid.gov/medicaid/program-information/medicaid-and-chip-enrollment-data/report-highlights" },
      { label: "Federal Register: the federal share for each state (the 50 and 83 percent limits)", url: "https://www.govinfo.gov/content/pkg/FR-2025-11-28/html/2025-21332.htm" },
      { label: "Medicare.gov: Medicaid and the 2027 work rule", url: "https://www.medicare.gov/basics/costs/help/medicaid" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { text: /title XIX of the Social Security Act|\bMedicaid (?:program|beneficiar(?:y|ies)|eligib\w+|expansion|coverage)|State plan under title XIX/i } },

  { id: "social-security", kind: "topic", title: "Social Security",
    bullets: [
      "Social Security pays monthly income to retired workers, to workers who become disabled, and to the families of workers who have died. About 70 million people got payments in December 2025.",
      "Workers pay for it through a tax on wages: 6.2 percent from the worker and 6.2 percent from the employer. In 2026 the tax applies to the first $184,500 a person earns in the year. About 185 million workers paid it in 2025.",
      "The size of a person's monthly payment depends on what they earned while working. Retirement payments can start at 62, at a reduced amount. For people born in 1960 or later, the age for the full amount is 67.",
      "A federal agency, the Social Security Administration, runs it. The tax money goes into two funds that pay the benefits. In 2025 the program paid out $160 billion more than it took in and covered the gap from savings.",
      "The officials who oversee the funds project that the combined savings will run out in 2034. The taxes still coming in would then pay for 83 percent of the payments people are due."],
    sources: [{ label: "2026 Social Security Trustees Report (people paid, taxes, the 2034 projection)", url: "https://www.govinfo.gov/content/pkg/CDOC-119hdoc163/pdf/CDOC-119hdoc163.pdf" },
      { label: "Federal Register: Social Security amounts for 2026", url: "https://www.govinfo.gov/content/pkg/FR-2025-11-03/html/2025-19763.htm" },
      { label: "26 U.S.C. 3101 (the tax on wages)", url: USC(26, "3101") },
      { label: "HealthCare.gov glossary: Social Security", url: "https://www.healthcare.gov/glossary/social-security/" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { text: /title II of the Social Security Act|old-age, survivors, and disability insurance|Social Security (?:benefits?|retirement|trust funds?|Administration)|Federal Old-Age and Survivors Insurance Trust Fund/i } },

  { id: "yearly-spending-bills", kind: "topic", title: "How Congress pays for the government each year",
    bullets: [
      "The federal budget year runs from October 1 to September 30. Agencies may spend only money that Congress has approved by law, so each year Congress must pass new spending bills. Today there are 12 regular ones.",
      "Those yearly bills cover about 27 percent of federal spending: $1,875 billion in the 2025 budget year. The other 73 percent is set by other laws and continues without a yearly vote. It includes Social Security, Medicare and interest on the national debt.",
      "If the yearly bills are not finished by October 1, Congress usually passes a stopgap law (called a continuing resolution). It keeps agencies running at a set level until a set date.",
      "With no yearly bill and no stopgap, agencies without money must by law stop most work. That is a government shutdown. Work that protects human life or property goes on, and federal workers sent home are paid once it ends.",
      "Since 1977, Congress has finished every regular spending bill on time in only three budget years: 1989, 1995 and 1997."],
    sources: [{ label: "31 U.S.C. 1102 (the budget year)", url: USC(31, "1102") }, { label: "31 U.S.C. 1341 (no spending without approval; back pay)", url: USC(31, "1341") },
      { label: "31 U.S.C. 1342 (work that goes on in a shutdown)", url: USC(31, "1342") },
      { label: "Budget of the U.S. Government, 2027: budget concepts (shares of spending, stopgap laws, shutdowns)", url: "https://www.govinfo.gov/content/pkg/BUDGET-2027-PER/pdf/BUDGET-2027-PER-4-2.pdf" },
      { label: "House Practice: the 12 regular spending bills", url: "https://www.govinfo.gov/content/pkg/GPO-HPRACTICE-118/pdf/GPO-HPRACTICE-118-5.pdf" },
      { label: "U.S. Senate: bills, acts and laws", url: "https://www.senate.gov/legislative/bills_acts_laws.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { title: /\bmaking (?:(?:further|additional|continuing|supplemental|emergency|consolidated|full-year|omnibus) )*appropriations\b|\bAppropriations Act\b|\bContinuing Appropriations\b/i } },

  { id: "budget-majority-route", kind: "process", title: "The budget route that passes the Senate with a simple majority",
    bullets: [
      "Most bills need 60 of the 100 senators to end debate before the Senate can vote. One kind of budget bill does not.",
      "Congress first passes a budget plan. The plan can call for set changes to spending, to taxes or to the limit on how much the government may borrow. A bill that carries out those instructions (a reconciliation bill) follows special rules.",
      "By law, Senate debate on that bill is limited to 20 hours. When the 20 hours are up, debate ends without a vote. So the 60-vote step is not needed, and the bill can pass with a simple majority (more than half of the senators voting).",
      "There are limits. Any senator can ask to strike a part that does not change spending or taxes, and keeping it takes 60 votes. The bill may not change Social Security."],
    sources: [{ label: "2 U.S.C. 641 (the instructions, the 20-hour limit, Social Security)", url: USC(2, "641") }, { label: "2 U.S.C. 644 (parts that do not belong)", url: USC(2, "644") },
      { label: "U.S. Senate: ending debate", url: "https://www.senate.gov/about/powers-procedures/filibusters-cloture.htm" }, { label: "U.S. Senate: voting", url: "https://www.senate.gov/about/powers-procedures/voting.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { title: /\breconciliation\b/i, text: /\bto provide for reconciliation pursuant to\b/i } },

  { id: "tariffs", kind: "topic", title: "Tariffs",
    bullets: [
      "A tariff is a tax on goods brought into the United States from other countries. It is usually a percentage of the value of the goods.",
      "The business that brings the goods in owes the tax when they arrive. It pays a federal agency, U.S. Customs and Border Protection, and the money goes to the Treasury.",
      "The Constitution gives Congress the power to set tariffs, and Congress keeps a list of the rate for each kind of product. Congress has also passed laws that let the President add tariffs in set cases. Examples: when imports threaten national security, or when another country trades unfairly.",
      "On February 20, 2026, the Supreme Court ruled that tariffs the President had imposed since February 2025 under a law meant for national emergencies were unlawful. The government is refunding them to the businesses that paid. Tariffs under the national-security and unfair-trade laws stayed in place.",
      "Tariffs and other customs charges brought in about $195 billion in the 2025 budget year, up from about $77 billion in 2024. The 2025 total includes tariffs the Court later struck down."],
    sources: [{ label: "19 U.S.C. 1505 (who pays, and when)", url: USC(19, "1505") }, { label: "19 U.S.C. 1862 (national security)", url: USC(19, "1862") },
      { label: "19 U.S.C. 2411 (unfair trade by another country)", url: USC(19, "2411") },
      { label: "Federal Register, 8 July 2026: customs notice on the Supreme Court ruling", url: "https://www.govinfo.gov/content/pkg/FR-2026-07-08/html/2026-13771.htm" },
      { label: "Federal Register, 25 February 2026: order ending the emergency tariffs", url: "https://www.govinfo.gov/content/pkg/FR-2026-02-25/html/2026-03832.htm" },
      { label: "Budget of the U.S. Government, 2027: customs duties and fees by year", url: "https://www.govinfo.gov/content/pkg/BUDGET-2027-TAB/xls/BUDGET-2027-TAB-3-5.xlsx" },
      { label: "Government Accountability Office: what a tariff is", url: "https://www.govinfo.gov/content/pkg/GAOREPORTS-NSIAD-00-210/html/GAOREPORTS-NSIAD-00-210.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { title: /\btariffs?\b/i, text: /Harmonized Tariff Schedule|section 232 of the Trade Expansion Act|section 301 of the Trade Act|section 122 of the Trade Act|\brates? of duty\b/i } },

  // Written 17 Nov 2026 for the test-ready build, from the House's rules and manual, House Practice, the Constitution, the U.S. Code and
  // Senate.gov. Approved by the owner on 17 Nov 2026 ("Explainers are approved").
  { id: "house-fast-track", kind: "process", title: "The House's fast track for bills with wide support",
    bullets: [
      "The House has a shortcut for bills that few members oppose (called suspension of the rules). It is used often.",
      "Debate lasts 40 minutes, half for each side. Members cannot offer changes from the floor.",
      "A bill passes this way only if two-thirds of the members voting say yes. More than half is not enough.",
      "A bill that falls short is not dead. The House can take it up again under its regular process, where more than half is enough."],
    sources: [{ label: "Rules of the House, 119th Congress: Rule XV, clause 1", url: "https://www.govinfo.gov/content/pkg/HMAN-119/html/HMAN-119-pg716.htm" },
      { label: "House Practice: suspension of the rules", url: "https://www.govinfo.gov/content/pkg/GPO-HPRACTICE-118/pdf/GPO-HPRACTICE-118-54.pdf" },
      { label: "How Our Laws Are Made (House Document 110-49)", url: "https://www.govinfo.gov/content/pkg/CDOC-110hdoc49/html/CDOC-110hdoc49.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { actions: /\bsuspend the rules\b/i } },

  { id: "house-debate-terms", kind: "process", title: "How the House sets the terms of debate on a bill",
    bullets: [
      "Before the House debates most major bills, it votes on a short measure that sets the terms of the debate (often called the rule). Its title starts \"Providing for consideration of\".",
      "The terms say how long the debate lasts and which changes, if any, members may offer. Under a closed rule, no changes may be offered from the floor.",
      "A vote on the terms is not a vote on the bill. The bill gets its own vote afterward.",
      "Just before it, the House often votes on whether to end debate on the terms (called ordering the previous question). Both votes need more than half of the members voting."],
    sources: [{ label: "House Practice: special orders of business", url: "https://www.govinfo.gov/content/pkg/GPO-HPRACTICE-118/pdf/GPO-HPRACTICE-118-53.pdf" },
      { label: "House Practice: the previous question", url: "https://www.govinfo.gov/content/pkg/GPO-HPRACTICE-118/pdf/GPO-HPRACTICE-118-40.pdf" },
      { label: "Rules of the House, 119th Congress: Rule XIII, clause 6", url: "https://www.govinfo.gov/content/pkg/HMAN-119/html/HMAN-119-pg667.htm" },
      { label: "An example: H. Res. 1650, setting the terms for H.R. 1013", url: "https://www.govinfo.gov/content/pkg/BILLS-119hres1650rh/html/BILLS-119hres1650rh.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { actions: /Considered under the provisions of rule H\. ?Res\.|Rule provides for consideration of/i } },

  { id: "veto-override", kind: "process", title: "What happens when the President vetoes a bill",
    bullets: [
      "After Congress passes a bill, the President has 10 days, not counting Sundays, to sign it or send it back with objections. Sending it back is a veto.",
      "Congress can still make the bill law. Two-thirds of the members voting in the House, and then two-thirds in the Senate, must vote to pass it again.",
      "If the President does nothing for 10 days while Congress is meeting, the bill becomes law without a signature. If Congress has gone home so the bill cannot be sent back, the bill dies (a pocket veto), and Congress cannot undo that.",
      "Overrides are rare. The Senate's count lists 2,599 vetoes in U.S. history; 112 were overridden."],
    sources: [{ label: "U.S. Constitution, Article I, section 7 (House Document 110-50)", url: "https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/html/CDOC-110hdoc50.htm" },
      { label: "House Practice: veto of bills", url: "https://www.govinfo.gov/content/pkg/GPO-HPRACTICE-118/pdf/GPO-HPRACTICE-118-58.pdf" },
      { label: "U.S. Senate: vetoes, 1789 to present", url: "https://www.senate.gov/legislative/vetoes/vetoCounts.htm" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { actions: /\bvetoed\b|\bveto message\b|objections of the President/i } },

  { id: "war-powers", kind: "process", title: "How Congress can order troops out of a conflict",
    bullets: [
      "A 1973 law, the War Powers Resolution, limits how long a President can use the armed forces in fighting without approval from Congress.",
      "The President must report to Congress within 48 hours of sending forces into fighting. The forces must come out within 60 days, plus up to 30 more to withdraw them safely, unless Congress approves the action.",
      "Congress can also vote to direct the President to remove the forces. The law puts these measures ahead of other business, with deadlines for a vote.",
      "What such a vote does depends on its kind. One kind is not sent to the President and, by the Senate's own description, does not have the force of law. The other kind goes to the President, who can veto it."],
    sources: [{ label: "50 U.S.C. 1543 (the 48-hour report)", url: USC(50, "1543") }, { label: "50 U.S.C. 1544 (the 60 days, and removal when Congress directs it)", url: USC(50, "1544") },
      { label: "50 U.S.C. 1546 and 1546a (priority for these measures)", url: USC(50, "1546a") },
      { label: "U.S. Senate glossary (the two kinds of measure)", url: "https://www.senate.gov/about/research-tools/glossary.htm" },
      { label: "House Practice: war powers", url: "https://www.govinfo.gov/content/pkg/GPO-HPRACTICE-118/pdf/GPO-HPRACTICE-118-15.pdf" }],
    lawAsOf: "2026-11-17", reviewed: true, match: { title: /War Powers Resolution|remov(?:e|al of) United States Armed Forces/i } },

  { id: "constitutional-amendment", kind: "process", title: "How the Constitution gets amended",
    bullets: [
      "Changing the Constitution takes two steps. First, two-thirds of the members voting in both the House and the Senate must approve the proposed change.",
      "Second, three-fourths of the states must approve it: 38 of the 50. Congress chooses whether state legislatures or special state conventions decide.",
      "The President has no formal part. A proposed amendment is not sent to the President to sign.",
      "It rarely succeeds. Congress has sent 33 amendments to the states, and 27 were approved. About 12,000 have been proposed in Congress since 1789."],
    sources: [{ label: "U.S. Constitution, Article V (House Document 110-50)", url: "https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/html/CDOC-110hdoc50.htm" },
      { label: "Constitution Annotated: Article V", url: "https://www.govinfo.gov/content/pkg/GPO-CONAN-2022/pdf/GPO-CONAN-2022-12.pdf" },
      { label: "U.S. Senate: measures proposed to amend the Constitution", url: "https://www.senate.gov/legislative/MeasuresProposedToAmendTheConstitution.htm" },
      { label: "1 U.S.C. 106b (how a ratified amendment is certified)", url: USC(1, "106b") }],
    lawAsOf: "2026-11-17", reviewed: true, match: { title: /Proposing an amendment to the Constitution/i } },
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
