# The writing standard for bill summaries

Owner instruction, 17 Nov 2026. It applies to every Analysis section. The rules are checked by machine in
`lib/analysis/standard.ts` and `lib/analysis/checker.ts`; tests are in `tests/standard.test.mjs`.

1. **Assume zero familiarity** with the bill, the agency or the subject.
2. **Headline**: at most 15 words; starts with a clear verb (Blocks, Raises, Cuts, Requires, Bans, Funds, Lets, Ends);
   names the everyday thing people know; no abbreviations.
   Bad: "Would block a 2027 HHS rule on marketplace payment parameters."
   Good: "Blocks new 2027 rules for health plans people buy on HealthCare.gov."
3. **In plain English**: 2 or 3 sentences, at most 80 words: what it does, who feels it and what changes for them, and
   why it is being fought over now. For a bill that cancels a rule, say in positive terms what the rule does, then
   that the bill cancels it. No procedure words.
4. **Specifics over generalities**: dollar amounts, numbers of people, dates. Filler ("would affect payment and program
   standards", "certain provisions") fails. With no concrete fact, the summary fails unless it says the sources do not
   say and is marked low-confidence.
5. **Jargon**: every term on the list in `standard.ts` (`JARGON`) is replaced with plain words or explained in
   parentheses on first use; never in the headline. Add a term whenever a review or the reader test finds a new one.
   Abbreviations are spelled out on first use.
6. **Case for and against**: reasons and stakes, not mechanics, from the official record: floor statements
   (Congressional Record), the agency's stated reasons (Federal Register preamble), committee reports and minority
   views, the CRS summary. Each credited to the named person or body. A reason credited to a floor speaker must come
   from that speaker's own words. If the record holds no reason for a side: "No public statement of reasons found."
7. **Layers on the page**: headline, In plain English, "Explain more" (background, details, the cases), sources.

## The average-reader test

`lib/analysis/reader-test.ts`. It runs on every draft that passes the written rules, before the summary can be shown.

- Call 1, the reader: sees only the headline and the plain-English part, as an average adult with no background
  knowledge. Answers: what does the bill do; who is affected and how; what would change in daily life; which words it
  did not understand.
- Call 2, the check: compares the three answers with the source documents, and checks that each reason in the case
  for and against was given by the person or body it is credited to, on that side.
- Fail: any answer wrong or vague, or any word not understood. Everyday words (`COMMON_KNOWLEDGE`: Congress, Senate,
  stock, insurance …) are not failures; agency names, programs, procedures, legal and financial terms and
  abbreviations are.
- A failure sends the draft back with the specific reason, at most 2 retries; then the summary is held for review.
- Every test is stored (`analysis_reader_tests`) and logged (`READER_TEST …`). Pass rate and added cost per summary
  are on the probe (`analysis.readerTest`) and on Editor → Summary quality.

## Sources the generator may use (each cited by id and linked)

Bill text; STATUS (the bill's actions and votes); CRS summary; CBO (listing, and the estimate when printed in a
committee report or the Record); REPORT (committee report: purpose, background, minority views); RULE (Federal
Register: the agency's summary, its stated reasons, main changes, its own impact estimates, dollar amounts); USC
(sections the bill amends); FLOOR (Congressional Record: what each named member said, opening and closing).
Never news or advocacy sources. Not yet automatic: press releases on .gov sites and full CRS reports (no reliable
official index per bill).

## Gold examples

`lib/analysis/gold-examples.ts`: S.J.Res. 197, H.R. 2102, H.R. 7008, written by hand from the records and checked by
`tests/gold.test.mjs` against the same rules. They enter the generator prompt only when the owner approves them
(`GOLD_APPROVED` in `lib/analysis/gold.ts`).

## Bring the reader up to speed first (owner instruction, 17 Nov 2026, generator b7)

Page order: Headline → In plain English → How it works today → What would change → Why now → (official status
timeline) → Who it affects → Cost → What changes for you → Case for and against → What we don't know → Sources.

- **How it works today** (required): 3 to 5 short bullets, each tied to a source: what the thing is, who uses it, how
  it is run and paid for, the key numbers, and what current law or the current rule says on the exact points the bill
  touches.
- **What would change**: 2 to 6 rows, each "Today: … → If this passes: …", with the numbers and dates in the sources.
  A row with no number, date or clear rule flip (may / may not) fails, as does "some rules would change". When the
  records do not say what would replace something, the row says so.
- **Why now**: one or two sentences with the date or the vote.
- **Process primers** (`lib/analysis/primers.ts`, kind "process"): a one-tap explainer when a bill uses a special
  route (cancelling an agency rule, a vote on whether to start debate, the 60-vote step), with "In this case" from the
  bill's own timeline.
- **Topic primers** (kind "topic"): written once from official sources for a recurring subject, held to the same
  wording rules (tests/primers.test.mjs), used only when `reviewed` is true (the owner's approval). A reviewed topic
  primer is given to the generator as the source "PRIMER" so every related summary explains the subject the same
  way, and is linked from the page. Each carries `lawAsOf`; recheck it when a law on its subject is enacted.
  Written so far: health plans bought on HealthCare.gov; military retirement and veterans' disability pay. To write:
  Medicare, Medicaid, Social Security, the federal budget process, tariffs.
- **Reader test, second part**: a second reader sees the page from the headline through "Who it affects" and must
  correctly describe how things work today, what exactly changes and who is affected.
- New fields are stored in `analysis_summary_structure` (migration 0032; a new table).
