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
