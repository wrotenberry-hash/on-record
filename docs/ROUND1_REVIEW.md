# Round 1: strict review of the first five real summaries

Run: 16 Nov 2026, 19:00 UTC, the first with the replaced OpenAI key. Model gpt-5.4-mini,
generator version b2-2026-11-16. Reviewed by Claude the same hour against the text of the
sections each summary cites (read from the run's own log; see decision O-105).

## Cost (from the health probe)

| | |
| --- | --- |
| Summaries written | 5, across 5 categories (defense, economy, energy, elections, health care) |
| Total cost | $0.0321 (8 model calls: 5 first drafts, 3 second tries) |
| **Cost per summary** | **$0.0064** (0.6 cents; range 0.52 to 0.73 cents) |
| At the $25 monthly cap | about 3,900 summaries a month |
| Rule checker | 3 passed and are shown; 2 held after two tries (both for reading level) |

## What could and could not be reviewed

The log reader cuts each line at about 2,000 characters, and the packet used 3,000-character
lines. So for every summary the headline, "what it does", "who it affects", "what changes for
you", both arguments for and the first argument against were read in full, with the opening
two thirds of each cited section. **Not read: the second argument against and "what we don't
know" for each summary.** Lines are now 1,500 characters, so the rewrite will be read whole.

## Findings, summary by summary (before)

| Bill | Checker | Accuracy against the cited text | Problems |
| --- | --- | --- | --- |
| H.R. 2102, Major Richard Star Act | Held: reading grade over 12 | Every point matches Sec. 2 | Too dense for an ordinary reader: "concurrent receipt" and "chapter 61" are never explained; sentences of 25+ words. The checker was right to hold it. |
| H.R. 1013, 403(b) plans | Passed | "What it does" matches Sec. 2 | "Who it affects" says the plans are for "public schools, charities, and churches" and names "trust companies": neither is in the cited section. Added from general knowledge. |
| H.R. 9612, uranium enrichment | Held: reading grade over 12 | Every point matches Sec. 2 | "Nuclear Regulatory Commission" written out eight times; long sentences. Accurate but heavy. |
| H.R. 7008, stock trading and voter photo ID | Passed | "What it does" and "who it affects" match Sec. 2 and Sec. 3 | **Misleading:** "Most people would see no direct change unless they are voting in a federal election." Most adults vote in federal elections; the photo ID rule is the change. |
| S.J.Res. 197, disapproving a CMS rule | Passed (also picked for the 1-in-5 audit) | Matches the resolution text | An argument that only restates the bill ("Congress should stop a rule it does not want"). An argument attributed to "health coverage advocates" although nothing in the text says what the rule does, so which side they would take is a guess. |

No summary misstated what a bill would do. No loaded words, no verdicts, for and against the
same length (probe: the case for is 50–51% of the argument words for both parties' bills).

## Patterns and fixes (generator b3-2026-11-16, checker)

| Pattern | Fix |
| --- | --- |
| Dense writing fails the reading rule, and the second try stays dense because the feedback was only "grade 13.2" | Generator: sentences under 20 words; name an agency or law in full once, then a short form. Checker feedback now names the longest sentences and the hardest words to replace. |
| Official names counted as hard vocabulary | Checker: a run of capitalised words ("Nuclear Regulatory Commission") counts as one short word for the reading level. The limit (grade 12, target 8) is unchanged. |
| "Most people would see no change unless…" | Generator: if the bill puts a duty on the general public, say that first; never follow "no direct change" with "unless" or "except". Checker: that sentence shape now fails. |
| Groups or examples added from general knowledge | Generator: name only what the cited section or the CRS summary states. Checker: a point whose words are mostly absent from its cited section gets a warning for the editor. |
| Arguments that restate the bill, or guess a group's side when the text does not say what a rule does | Generator: an argument must give a reason tied to the text; for a bare disapproval resolution, attribute only to the resolution's sponsor and the agency that issued the rule, and say in "what we don't know" that the text does not describe the rule. |

Regression tests: `tests/analysis.test.mjs`, "Round 1 review fixes".

## After: generator b3, reviewed 16 Nov 2026 (run started by the owner at 21:35 UTC)

Cost: 0.35 cents a summary on average ($0.0175 for all five; the one with a retry cost 0.73 cents).
Month-to-date model spend is $0.11 against the $25 summary cap.

| Bill | Result | Against the cited section text |
| --- | --- | --- |
| H.R. 7008 | Shown, grade 10.9 | Accurate: purchase ban for Members, spouses and dependent children; notice before sales; fees; photo ID with a provisional ballot and a 3-day cure; notice to registrants; copying devices in public buildings. One point (ethics offices issue guidance) sits past the part of Sec. 2 the log carried (6,000 characters), so it could not be checked; the log now carries up to 16,000. |
| H.R. 9612 | Shown, grade 10.5 | Accurate: construction before a license on the same terms as other fuel cycle facilities; rules within 180 days; environmental review, hearing rights and inspections unchanged. One argument names "state and public-interest advocates" but is attributed to "state officials". |
| H.R. 1013 | Shown, grade 9.7 | Accurate on the securities-law changes and the plans covered. |
| H.R. 2102 | Held: grade 12.9 after 2 tries | Accurate on every point, including the effective date. Held only because its subject words ("disability", "compensation", "combat-related") counted as hard words, which a veterans' bill cannot avoid. |
| S.J.Res. 197 | Held: low confidence | Correct to hold. The bill text could not be found, so there is nothing to check it against. |

No summary misstated what a bill does. The "no change unless" pattern and the invented groups are gone.

### Fixes (generator b4-2026-11-16)

| Pattern | Fix |
| --- | --- |
| The bill's own subject words pushed an accurate summary over the grade limit | Checker: words from the bill's official title count as one short word for the reading level, as official names already do. H.R. 2102 goes from 12.9 to 8.6. The limit is unchanged. |
| "Budget analysts could say…" repeats the attribution, makes the longest sentences, and let one argument name a different group than its attribution | Generator: write the reason itself; the attribution says who and must be the same group. Checker: an argument that starts "… could say" fails. |
| The review log cut cited sections at 6,000 characters | The log now carries up to 16,000 characters of each cited section. |

**Next:** the 13:00 UTC run on 17 Nov rewrites all five under b4. If they pass, the 5-summary
limit is raised and the $25 cap becomes the only limit.

## Owner review, 16 Nov 2026: summaries restated titles; S.J.Res. 197's headline was wrong

The owner found the summaries hard to digest (they restated official titles) and S.J.Res. 197's headline
inaccurate: "Would block a Health and Human Services rule for Medicare, Medicaid, and the Basic Health Program."
The rule is the ACA marketplace *Notice of Benefit and Payment Parameters for 2027* (individual-market plans on the
federal exchanges) and the Basic Health Program. It has nothing to do with Medicare or Medicaid.

**Why the generator got it wrong.** It had only the resolution's text, which names the rule and the agency that
issued it, the "Centers for Medicare & Medicaid Services". It read the agency's name as the programs the rule covers.

**Why the checker and Claude's Round 1 review missed it.**
1. *Checker:* a resolution has no numbered sections. With no sections, any "Full text" citation was accepted and
   nothing was compared with the text at all, and the headline was never checked against anything.
2. *Review log:* the log looked cited sections up by number, so "Full text" was logged as "NOT FOUND IN THE BILL
   TEXT", although the text had been read (3,130 characters).
3. *Claude's review:* it took that log line at face value, wrote "the bill text could not be found, so there is
   nothing to check it against", and passed over the summary because it was held. It never read the headline. A held
   summary is still reviewed now, in full, against every source.

**Fixes (generator b5-2026-11-16).**
- *Sources:* besides the bill text, the generator gets, each cited by id and labelled: the CRS summary, CBO, the
  committee report (purpose, background, minority or dissenting views, the CBO section it prints), the disapproved
  rule from the Federal Register (title, agencies, the agency's own summary), and the U.S. Code sections the bill
  amends (govinfo). No news or advocacy sources.
- *Claim check:* every named program, group, place, number and date in the headline, "In plain English",
  "Background" and the voting question must appear in a source, with agency names masked on both sides. The old
  S.J.Res. 197 headline fails: "Medicare", "Medicaid".
- *Not the title:* a headline or plain-English part that mostly restates the official title fails.
- *Template:* "In plain English" (2–3 sentences: what, to whom, why now); "Background", required when a rule or law
  is changed or blocked; "What changes for you" needs one concrete person and fails circular wording; arguments are
  credited only to an actor in the record (the named sponsor, the reporting committee, its minority views, the
  agency that issued a rule), each citing its source. A side no one in the record argues is left empty, and the page
  says so.
- *Full text:* a resolution with no numbered sections is checked against its full text.
- *Status:* procedural floor votes are steps in the timeline ("Senate voted 48–51 not to take it up, Sep 29").
- *Voting question:* from the plain headline, with the official title one tap away.

Regression tests: `tests/summary-b5.test.mjs` (S.J.Res. 197 on the real Federal Register record),
`tests/floor-votes.test.mjs`, `tests/stance-question.test.mjs`.

**Publishing:** readers see no summaries until the owner has reviewed S.J.Res. 197 (`PUBLIC_MIN_PROMPT` in
`lib/analysis/publish-gate.ts`). The cap stays at 5.
