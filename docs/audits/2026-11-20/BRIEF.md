# Audit brief: read one bill summary claim by claim against its official sources

You are given ONE packet file. It holds, in order: `===== SUMMARY =====` (the summary now shown to trial readers, as JSON:
headline, plainEnglish in `details`, `structure.howItWorksToday`, `structure.changes` rows {label, before, today, ifPassed},
`structure.whyNow`, whatItDoes, whoItAffects, whatChangesForYou, caseFor, caseAgainst, unknowns, details.question), then the
official sources it was written from (`SOURCE CRS`, `SOURCE REPORT`, `SOURCE FLOOR`, `SOURCE STATUS`, `SOURCE RULE`, `SOURCE CBO`,
`SOURCE USC …`, `CITED Sec. N` = bill sections, `CONTEXT`, `HEADINGS`). Words run together in the dump ("thisbill") are a
dump artefact, not a fault. A section marked MISSING parts could not be fully fetched: say so, do not guess.

Read every statement in the summary and find the source passage it rests on. Use ONLY the packet. Do not use outside
knowledge to confirm or contradict anything. Do not edit any project file. Do not fix anything.

Report only these kinds of fault:
1. WRONG CREDIT: a statement credited to the wrong person or body (one member's words given to another, to "the committee",
   "the minority", "supporters", or stated as plain fact when it is one member's claim).
2. EXACT WORD CHANGED: a word with an exact meaning swapped for a near one (directs/requires, may/shall/must, authorizes/funds,
   annual/every two years, a report to committees called "public", held in trust/given to, etc.).
3. CONDITION DROPPED: a condition, exception, limit, "approximately", "only if", "provided that", "as estimated by" that the
   source attaches and the summary leaves off so the statement says more than the source.
4. NO SOURCE: a fact, consequence, example or prediction no source in the packet states.
5. ABOUT THE SOURCES: wording such as "the sources do not say", "the records do not state", "in the text provided".
OTHER: anything else that tells the reader something false (wrong number, date, vote count, name).

For each finding give: tier (CORE = headline, plainEnglish, howItWorksToday, changes; EXTENDED = everything else), the
part, the kind, the summary's words, the source's words (quoted, with the source id), and severity:
MISSTATES (a reader is told something false or materially different) or MINOR (looser wording, same meaning).
Be strict about meaning and fair about plain language: a plain everyday paraphrase that keeps the meaning is NOT a fault.

Write the full findings to the findings file you are given (markdown). Then return ONLY this, at most 250 words:
BILL: <label>
VERDICT: CLEAN | MINOR ONLY | MISSTATES
CORE: <n> MISSTATES, <n> MINOR — then the up to 4 most serious, one line each: part | kind | "summary words" vs "source words"
EXTENDED: <n> MISSTATES, <n> MINOR — then the up to 3 most serious, one line each, same form
LIMITS: anything you could not check (missing parts)
