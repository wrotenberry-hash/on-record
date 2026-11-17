import type { SummaryDraft } from "./checker.ts";

export type GoldExample = { label: string; billId: string; summary: SummaryDraft };

/**
 * Three summaries written by hand to the 17 Nov 2026 writing standard, from the official records only (the bill
 * texts, the Federal Register rule, the Congressional Record floor debates, a committee report and the U.S. Code,
 * all read from govinfo.gov on 17 Nov 2026). Every fact was checked against a verbatim quote from those records.
 * tests/gold.test.mjs runs each through the same checker as any generated summary.
 * They enter the generator prompt only when the owner approves them (GOLD_APPROVED in gold.ts).
 */
export const GOLD_EXAMPLES: GoldExample[] = [
  { label: "S.J.Res. 197 (a resolution that would cancel an agency rule)", billId: "119-sjres-197", summary: {
    headline: "Blocks new 2027 rules for health plans people buy on HealthCare.gov.",
    plainEnglish: "A new federal rule changes the health insurance people buy for themselves on HealthCare.gov, the government's insurance site, starting in 2027. It lets insurers sell plans where a person can owe up to $15,600 a year in medical bills; the government says the rule lowers prices and expects 1.2 to 2 million fewer people to have this insurance. This bill would cancel the rule and undo those changes, but senators voted 48–51 on September 29, 2026, against debating it.",
    howItWorksToday: [
      { text: "People who do not get health insurance through a job or a government program can buy a private plan for themselves on HealthCare.gov or a state-run site. About 23 million people chose one for 2026.", section: "PRIMER" },
      { text: "The government helps many buyers pay with a tax credit that lowers the monthly price, based on household income.", section: "PRIMER" },
      { text: "A federal agency sets the rules and fees for these plans each year. Its rule for 2027 was published May 20, 2026, and took effect July 20, 2026.", section: "RULE" },
      { text: "The 2027 rule lets a low-price plan with very high costs before it pays last up to 10 years instead of one. It also raises the most some buyers can owe in a year and cuts a fee insurers pay.", section: "RULE" },
      { text: "The agency expects 1.2 to 2 million fewer people to have these plans in 2027 under the rule. It estimates average prices at least 1.2 percent lower.", section: "RULE" }],
    changes: [
      { today: "The 2027 rule is in force. It took effect July 20, 2026.", ifPassed: "The rule is cancelled and treated as if it never took effect. The agency could not issue a nearly identical rule without a new law.", source: "Full text" },
      { today: "A low-price plan with very high costs before it pays may last up to 10 years, starting with 2027 plans.", ifPassed: "These plans go back to lasting one year at a time.", source: "RULE" },
      { today: "Insurers may sell bronze plans (the level with the lowest monthly price) where a person can owe up to $15,600 a year for care.", ifPassed: "The yearly limit for one person stays $12,000 on every plan for 2027.", source: "RULE" },
      { today: "Insurers selling on HealthCare.gov pay a fee of 1.9 percent of what customers pay for plans in 2027, down from 2.5 percent in 2026.", ifPassed: "The cut to 1.9 percent is cancelled. The records do not say what rate would apply instead.", source: "RULE" }],
    whyNow: "The rule took effect July 20, 2026, and applies to plans for 2027. A senator used a law that lets Congress vote quickly on cancelling a new rule; on September 29, 2026, the Senate voted 48–51 against debating it.",
    background: "", backgroundSources: [],
    question: "Do you support blocking the new 2027 rules for health plans bought on HealthCare.gov?",
    whatItDoes: [
      { text: "Cancels the 2027 rule for Affordable Care Act health plans. The resolution says the rule would have no force or effect.", section: "Full text" },
      { text: "That undoes the rule's changes, such as allowing plans with very high deductibles to last up to 10 years instead of one.", section: "RULE" },
      { text: "It also undoes a cut in the fee insurers pay to sell plans on HealthCare.gov, from 2.5 percent of what customers pay to 1.9 percent.", section: "RULE" }],
    whoItAffects: [
      { text: "People who buy their own coverage on HealthCare.gov or a state-run site. The agency expected about 18.9 million people to have these plans in 2027 before the rule.", section: "RULE" },
      { text: "The 1.2 to 2 million people the agency expects to leave these plans in 2027 under the rule, many after stronger checks on who qualifies for help paying.", section: "RULE" },
      { text: "Insurance companies. Under the rule they pay the government about $130 million less in fees.", section: "RULE" }],
    whatChangesForYou: "A person buying a bronze plan (the level with the lowest monthly price) could be offered one where they owe up to $15,600 a year out of pocket, instead of $12,000. Cancelling the rule would keep the lower limit.",
    caseFor: [
      { argument: "The rule would end coverage for up to 2 million people and raise costs for millions more, she says, citing the administration's own estimate.", attribution: "Sen. Tammy Baldwin, the sponsor", source: "FLOOR" },
      { argument: "She says it pushes people toward plans with very high deductibles that cover little when they get sick, and leaves fewer doctors who take their insurance.", attribution: "Sen. Baldwin (floor statement, September 29, 2026)", source: "FLOOR" }],
    caseAgainst: [
      { argument: "The agency says plan prices have risen faster than incomes and the rule gives people cheaper choices. It estimates average monthly prices at least 1.2 percent lower than without the rule.", attribution: "the Centers for Medicare & Medicaid Services, which issued the rule", source: "RULE" },
      { argument: "The agency says stronger checks stop payments to people who do not qualify, and stop people being signed up without knowing it and then getting a surprise tax bill.", attribution: "the Centers for Medicare & Medicaid Services, which issued the rule", source: "RULE" }],
    unknowns: [
      "No senator argued against the resolution on the floor; the other side gave back its debate time.",
      "Parts of the rule carry out a 2025 law. The records do not say whether cancelling the rule would undo those parts.",
      "What happens next. The records show no further vote after September 29, 2026."],
    confidence: "medium",
    confidenceReason: "The rule is very long and parts of it carry out a 2025 law, so the full effect of cancelling it is not certain." } },

  { label: "H.R. 2102 (a bill that changes a benefit)", billId: "119-hr-2102", summary: {
    headline: "Lets about 58,000 combat-injured military retirees keep their full retirement pay.",
    plainEnglish: "Some troops are forced to retire early because of combat injuries. Today their military retirement checks are cut when they also get disability payments for veterans; this bill ends that cut, so the average retiree would get about $1,450 more each month. The House passed it 392–18 on November 12, 2026, though some who voted yes object that Congress has not said how to pay its $13 billion cost over 10 years.",
    howItWorksToday: [
      { text: "Service members normally earn monthly retirement pay after 20 years. People too badly hurt to keep serving can be medically retired sooner.", section: "PRIMER" },
      { text: "Veterans hurt in service also get a monthly disability payment from the Department of Veterans Affairs. A retiree who gets it must give up the same amount of retirement pay, dollar for dollar.", section: "PRIMER" },
      { text: "Retirees with 20 years of service whom the department rates at least 50 percent disabled get both in full. People medically retired with fewer than 20 years do not.", section: "PRIMER" },
      { text: "Retirees hurt in combat can get a separate monthly payment that returns part of what they give up. For those with fewer than 20 years it is capped.", section: "USC 10 §1413a" },
      { text: "About 58,000 medically retired people got that payment in September 2025. On average they gave up about $2,275 a month and got about $825 back.", section: "FLOOR" }],
    changes: [
      { today: "A combat-injured person medically retired with fewer than 20 years gives up about $2,275 a month of retirement pay and gets about $825 back, on average.", ifPassed: "They keep their full retirement pay and their disability payment: about $1,450 more a month on average.", source: "FLOOR" },
      { today: "The separate combat payment is capped for people who served fewer than 20 years.", ifPassed: "The cap is replaced by a rule that their retirement pay is not reduced at all.", source: "Sec. 2" },
      { today: "Current law does not include this spending.", ifPassed: "Federal spending rises by about $13 billion from 2027 through 2036, Congress's budget office estimates. The bill does not say how to pay for it.", source: "FLOOR" },
      { today: "Reduced payments continue every month.", ifPassed: "Full payments start the first month after the bill becomes law. Money lost in earlier years is not repaid.", source: "Sec. 2" }],
    whyNow: "Supporters forced a House vote with a petition after two committees did not act, and the House passed the bill 392–18 on November 12, 2026. It now waits in a Senate committee.",
    background: "", backgroundSources: [],
    question: "Do you support letting combat-injured military retirees keep both their retirement pay and disability pay in full?",
    whatItDoes: [
      { text: "Stops the cut to military retirement pay for people medically retired with a combat-related disability after fewer than 20 years of service.", section: "Sec. 2" },
      { text: "Raises the average affected retiree's income by about $1,450 a month, according to the budget office estimate printed in the House record.", section: "FLOOR" },
      { text: "Applies to payments starting the first full month after it becomes law. It does not repay money lost in earlier years.", section: "Sec. 2" }],
    whoItAffects: [
      { text: "About 58,000 medically retired service members with combat-related disabilities, a number the budget office expects to reach about 65,000 by 2036.", section: "FLOOR" },
      { text: "Taxpayers. The budget office estimates the bill adds about $13 billion from 2027 through 2036 to the gap between what the government spends and takes in.", section: "FLOOR" }],
    whatChangesForYou: "A soldier who was medically retired after 12 years because of a combat injury would get both payments in full. The budget office puts the average gain at about $1,450 a month. Most other people would see no change in their own pay.",
    caseFor: [
      { argument: "These veterans earned both payments and were forced to retire by their injuries; they did not choose to leave before 20 years.", attribution: "Rep. Ruiz (floor statement, November 12, 2026)", source: "FLOOR" },
      { argument: "The extra $1,450 a month is food on the table and bills paid, and can let a spouse cut back work hours to care for a wounded veteran.", attribution: "Rep. Elfreth (floor statement, November 12, 2026)", source: "FLOOR" }],
    caseAgainst: [
      { argument: "He supports ending the cut but says new veterans' benefits have to be paid for, and this bill is not. He prefers another veterans bill the House has passed.", attribution: "Rep. Bost (floor statement, November 12, 2026)", source: "FLOOR" }],
    unknowns: [
      "Why 18 House members voted no. None of them spoke in the debate.",
      "Whether the Senate will vote. The bill went to a Senate committee on November 12, 2026.",
      "How the cost would be covered. The budget office counts it as money the government would have to borrow."],
    confidence: "high",
    confidenceReason: "The bill is one short section, and the budget office estimate printed in the House record gives the numbers." } },

  { label: "H.R. 7008 (a bill that does two separate things)", billId: "119-hr-7008", summary: {
    headline: "Bans members of Congress from buying stocks and requires photo ID to vote.",
    plainEnglish: "This bill does two separate things. Members of Congress, their husbands or wives and dependent children could no longer buy shares of individual companies, and every voter would have to show a photo ID, or mail a copy of one, to vote for president or Congress. The House passed it 232–198 on July 22, 2026, the day the ID part was added; on September 30 it fell 7 votes short of the 60 needed to start debate in the Senate.",
    howItWorksToday: [
      { text: "No law stops members of Congress from owning or trading stocks. A 2012 law makes them report their trades after the fact.", section: "REPORT" },
      { text: "Members report a trade about a month after making it. No member has been prosecuted under the 2012 law.", section: "REPORT" },
      { text: "Each state sets its own rule on showing ID to vote. The member who wrote the bill said 24 states require a photo ID.", section: "FLOOR" },
      { text: "This bill joins the two subjects. The photo ID part was added on July 22, 2026, the day the House voted.", section: "FLOOR" }],
    changes: [
      { today: "Members of Congress, their spouses and dependent children may buy stock in any company.", ifPassed: "They may not buy stock in publicly traded companies, starting 180 days after the bill becomes law. They may keep what they own.", source: "Sec. 2" },
      { today: "Members report a stock sale about a month after it happens.", ifPassed: "They must post public notice 7 to 14 days before a sale.", source: "Sec. 2" },
      { today: "Buying stock is legal for members, so there is no penalty.", ifPassed: "A member who breaks the rule pays $2,000 or 10 percent of the trade, whichever is more, plus any profit.", source: "Sec. 2" },
      { today: "Each state decides whether voters must show a photo ID. The bill's author said 24 states require one.", ifPassed: "Every state must require a photo ID to vote for president or Congress, starting 90 days after the bill becomes law.", source: "Sec. 3" },
      { today: "States set their own rules for mailed ballots.", ifPassed: "A mailed ballot must come with a copy of a photo ID, a stamp from a notary (an official witness), or the last four digits of a Social Security number plus a sworn statement.", source: "Sec. 3" }],
    whyNow: "The House passed it 232–198 on July 22, 2026, the day the photo ID part was added. On September 30, 2026, the Senate voted 53–47 to move ahead, 7 short of the 60 needed, so it has stalled.",
    background: "", backgroundSources: [],
    question: "Do you support banning stock purchases by members of Congress and requiring photo ID to vote?",
    whatItDoes: [
      { text: "Bars members of Congress, their spouses and dependent children from buying stock in publicly traded companies. They may keep what they own and still buy broad investment funds.", section: "Sec. 2" },
      { text: "Makes them post public notice 7 to 14 days before selling a stock. Breaking the rules costs $2,000 or 10 percent of the trade, whichever is more, plus any profit.", section: "Sec. 2" },
      { text: "Requires a photo ID to vote in federal elections: a driver's license, state ID card, passport, military or veterans ID, or tribal ID. Mail voters must enclose a copy.", section: "Sec. 3" }],
    whoItAffects: [
      { text: "Members of Congress, their spouses and dependent children. The stock rules start 180 days after the bill becomes law.", section: "Sec. 2" },
      { text: "Anyone voting in a federal election. A voter without ID at the polls gets a provisional ballot (one set aside) that counts only if they show ID within 3 days.", section: "Sec. 3" },
      { text: "State and local election offices, which must apply the ID rules starting 90 days after the bill becomes law. The bill gives them no money for it.", section: "Sec. 3" }],
    whatChangesForYou: "A voter who mails in a ballot would have to enclose a copy of a photo ID. The other choices are a stamp from an official witness, or part of a Social Security number plus a sworn statement that they could not get a copy.",
    caseFor: [
      { argument: "On stocks: he says banning members from buying shares of individual companies removes even the appearance of wrongdoing, so Americans can be confident members work for them, not their own finances.", attribution: "Rep. Bryan Steil, the sponsor", source: "FLOOR" },
      { argument: "On voting: people already show photo ID to fly, open a bank account or buy a beer, and he says it would strengthen confidence in elections.", attribution: "Rep. Steil (floor statement, July 22, 2026)", source: "FLOOR" }],
    caseAgainst: [
      { argument: "On stocks: it is not a real ban, because members keep every share they own and may still buy private company stock, commodities and corporate bonds.", attribution: "the House Committee on House Administration minority (minority views, H. Rept. 119-479)", source: "REPORT" },
      { argument: "On voting: mail voters would have to photocopy an ID, and ballots backed by student, employer or some tribal IDs would be thrown out. Election offices get no federal money.", attribution: "Rep. Morelle (floor statement, July 22, 2026)", source: "FLOOR" }],
    unknowns: [
      "The cost. No budget office figure for the final bill is in the public record.",
      "How many voters lack one of the listed IDs. Speakers on both sides gave numbers without a source.",
      "Whether the Senate will try again. On September 30, 2026, it fell 7 votes short of taking the bill up."],
    confidence: "high",
    confidenceReason: "Both parts are spelled out in the bill text, and the floor debate and committee report give each side's reasons." } },
];
