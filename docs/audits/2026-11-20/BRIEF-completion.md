# Finish a check: verify core statements against official text the saved packet lacked

Context: a bill summary on a civic site was read claim by claim against a saved packet of its official sources. Some
statements in the summary's CORE (headline, plainEnglish, howItWorksToday, changes rows) could not be checked because
the packet lacked the bill section or record passage they rest on. Your job: fetch that official text and finish the
check for exactly those statements.

You are given: the packet file (the `===== SUMMARY =====` JSON is the summary; sources follow, each `SOURCE …` block
starts with its label and `<url>`), the findings file from the first reading (see its LIMITS / "could not be checked"
notes), and the list of statements to settle.

How to fetch: use `curl -s -m 40 -A "Mozilla/5.0" <url>` from Bash. www.govinfo.gov is reachable; www.congress.gov is
NOT (do not retry it). The bill's own text URL is in the SUMMARY JSON (`textUrl`, or the `sources` list: "Bill text …
govinfo.gov"). Congressional Record pages are on govinfo too (the FLOOR source's url; a page link may land on one item:
try the neighbouring items of the same issue by changing the trailing "-PgHxxxx-N" suffix or fetch the issue's
"/html/" listing). Save what you fetch under the scratch folder you are given, and strip tags with python to read it.
Use ONLY official text you fetched or the packet. No outside knowledge. Do not edit any project file.

For each statement: quote the summary's words, quote the official passage (with its section or page), and give one of:
VERIFIED (the text says it), MISSTATES (the text says something different: say what), CANNOT VERIFY (no official text
you could reach says it). Be strict about numbers, ages, dates and conditions.

Write full notes to the notes file you are given. Return ONLY, in at most 200 words:
BILL: <label>
EACH STATEMENT: one line each: "summary words" | VERIFIED / MISSTATES / CANNOT VERIFY | the official words (short)
CORE RESULT: ALL VERIFIED | HAS MISSTATEMENT | HAS UNVERIFIABLE STATEMENT
WHAT I FETCHED: urls and whether each answered
