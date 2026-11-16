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

## After (pending)

The five are rewritten by the next scheduled run (13:00 UTC, 17 Nov) because the generator
version changed; the earlier wording is kept in the version history. They will be reviewed
again in full. **The 5-summary limit stays until the rewritten five pass.** Until the rewrite,
the three shown summaries keep tonight's wording; no trial invite has been handed out yet.
