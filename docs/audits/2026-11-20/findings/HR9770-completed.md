# H.R. 9770 — Continuing Appropriations Act, 2027 — completion of the core check

Second reading. Purpose: settle the CORE statements the first reading (`findings/HR9770.md`) could not check because
the packet's copy of the bill text stopped at Sec. 123. Only official text fetched from www.govinfo.gov and the packet
were used. No project file was edited.

## What was fetched (saved under `fetched/HR9770/`)

| URL | Result |
|---|---|
| https://www.govinfo.gov/content/pkg/BILLS-119hr9770eh/html/BILLS-119hr9770eh.htm | 200. Engrossed in House, complete, Secs. 101-128 and short title. ANSWERED everything about the bill text. |
| https://www.govinfo.gov/content/pkg/BILLS-119hr9770ih/html/BILLS-119hr9770ih.htm | 200. Introduced version. Secs. 101-128 are word-for-word identical to the engrossed text (diff is empty). |
| https://www.govinfo.gov/content/pkg/BILLS-119hr9770rfs/... and .../BILLS-119hr9770pcs/... | 302, empty. No such versions. Not needed. |
| https://www.govinfo.gov/content/pkg/CREC-2026-07-21/html/CREC-2026-07-21-pt1-PgH4731.htm | 200. Full House debate, pages H4731-H4736, including the bill as printed in the Record. Answered (no "[…]" gaps). |
| .../CREC-2026-07-21-pt1-PgH4731-2.htm and -3.htm | "Page Not Found" pages. No neighbouring items exist under that suffix. |
| https://www.govinfo.gov/link/uscode/31/1512?link-type=html | 200. 31 U.S.C. 1512 (2024 edition). Answered. |
| https://www.govinfo.gov/link/uscode/31/1513?link-type=html | 200. 31 U.S.C. 1513 (2024 edition). Answered (same text as the packet). |

www.congress.gov was not tried, as instructed.

Note on the packet: the govinfo engrossed file is 19,365 characters after tags are stripped, so the packet's
"[19057 chars]" header was about right; the packet dump simply stopped partway through. The official file is complete.

## Statements settled

### S1 — changes row "Indian Health Service facilities", ifPassed — VERIFIED
- Summary: "The bill adds operating rates of $75,774,000 for services and $8,296,000 for facilities opened, renovated, or
  expanded in 2022, 2026, and 2027."
- Official text, Sec. 123 (engrossed; identical in introduced; identical as printed at Congressional Record H4733):
  - "(a) In addition to amounts otherwise provided by section 101, amounts are provided for ``Department of Health and
    Human Services--Indian Health Service--Indian Health Services'' at a rate for operations of $75,774,000, for an
    additional amount for costs of staffing and operating facilities that were opened, renovated, or expanded in fiscal
    years 2022, 2026, and 2027, and such amounts may be apportioned up to the rate for operations necessary to staff and
    operate such facilities."
  - "(b) In addition to amounts otherwise provided by section 101, amounts are provided for ``Department of Health and
    Human Services--Indian Health Service--Indian Health Facilities'' at a rate for operations of $8,296,000, for an
    additional amount for costs of staffing and operating facilities that were opened, renovated, or expanded in fiscal
    years 2022, 2026, and 2027, and such amounts may be apportioned up to the rate for operations necessary to staff and
    operate such facilities."
- Each element:
  - $75,774,000: matches (a). "for services" = the "Indian Health Services" account.
  - $8,296,000: matches (b). "for facilities" = the "Indian Health Facilities" account.
  - "adds": matches "In addition to amounts otherwise provided by section 101".
  - "operating rates": matches "at a rate for operations of".
  - Years "2022, 2026, and 2027": match exactly, including the odd-looking 2022. The text says "fiscal years"; the
    summary drops "fiscal".
  - "opened, renovated, or expanded": exact.
- Two small looseness notes, neither a misstatement:
  1. In the text BOTH amounts are "for costs of staffing and operating" those facilities. The summary's sentence can be
     read as if only the $8,296,000 is tied to the opened/renovated/expanded facilities and the $75,774,000 is for
     services generally. Under the row label "Indian Health Service facilities" the intended reading matches the text.
  2. The summary leaves out the further flexibility "such amounts may be apportioned up to the rate for operations
     necessary to staff and operate such facilities".

### S1b — same row, today — VERIFIED (from two sections read together)
- Summary: "The 2026 spending laws provide the base funding continued by the bill."
- Official text: Sec. 123 "In addition to amounts otherwise provided by section 101"; Sec. 101 "Such amounts as may be
  necessary, at a rate for operations as provided in the applicable appropriations Acts for fiscal year 2026".
- The bill does not name which 2026 Act carries the Indian Health Service; the statement does not either.

### S2 — headline, plainEnglish, details.question: "through December 4" — VERIFIED as to the date; condition left out
- Summary: headline "Funds federal agencies through December 4 to avoid a shutdown."; plainEnglish "This bill keeps most
  agencies running through December 4, 2026".
- Official text, Sec. 106: "Unless otherwise provided for in this Act or in the applicable appropriations Act for fiscal
  year 2027, appropriations and funds made available and authority granted pursuant to this Act shall be available until
  whichever of the following first occurs: (1) The enactment into law of an appropriation for any project or activity
  provided for in this Act. (2) The enactment into law of the applicable appropriations Act for fiscal year 2027 without
  any provision for such project or activity. (3) December 4, 2026."
- December 4, 2026 is the outer date and is correct. The "whichever ... first occurs" condition is not in the headline,
  plainEnglish or question; it IS in changes row 1 and whatItDoes item 1. Same finding as the first reading (C1, minor),
  now confirmed against the complete text. The full floor record uses the same shorthand: Rep. Cole, H4736, "It simply
  extends funding through December 4"; Rep. DeLauro, H4733, "extend government funding from September 30 through
  December 4".

### S3 — changes row 1, ifPassed: "a new full-year spending law" — MISSTATES (one added word; minor)
- Summary: "Most covered federal work keeps running through the earliest of a new full-year spending law, a spending law
  that omits that work, or December 4, 2026."
- Official text, Sec. 106(1): "The enactment into law of an appropriation for any project or activity provided for in
  this Act."
- What differs: the first trigger is the enactment of ANY appropriation for the project or activity. The text does not
  limit it to a full-year law; "full-year" appears nowhere in the bill. (In the fetched record "full-year" appears only
  in members' speeches about the regular bills, e.g. Rep. Cole, H4733, "preserves the path to full-year
  appropriations".) Dropping "full-year" would make the row match the text.
- The other two triggers are VERIFIED: "a spending law that omits that work" = Sec. 106(2) "the applicable
  appropriations Act for fiscal year 2027 without any provision for such project or activity"; "December 4, 2026" =
  Sec. 106(3). "the earliest of" = "whichever of the following first occurs".

### S4 — changes row "Starting new projects", ifPassed — VERIFIED
- Summary: "Money generally may not start or restart projects that had no 2026 money, including new Defense Department
  production and higher production rates."
- Official text:
  - Sec. 104: "Except as otherwise provided in section 102, no appropriation or funds made available or authority
    granted pursuant to section 101 shall be used to initiate or resume any project or activity for which
    appropriations, funds, or other authority were not available during fiscal year 2026."
  - Sec. 102(a): no section 101 funds for the Department of Defense "shall be used for: (1) the new production of items
    not funded for production in fiscal year 2026 or prior years; (2) the increase in production rates above those
    sustained with fiscal year 2026 funds; or (3) the initiation, resumption, or continuation of any project, activity,
    operation, or organization ... for which appropriations, funds, or other authority were not available during fiscal
    year 2026."
- "start or restart" = "initiate or resume"; "had no 2026 money" = "were not available during fiscal year 2026";
  "generally" fairly covers the limit to section 101 money. Small detail dropped: Defense new production is barred only
  for items "not funded for production in fiscal year 2026 or prior years".

### S5 — changes row "Starting new projects", today — CANNOT VERIFY
- Summary: "New yearly spending laws could fund new projects if Congress passes them."
- No official text fetched, and nothing in the packet, says this. The nearest passages only leave room for it:
  Sec. 104 restricts only money "made available ... pursuant to section 101"; Sec. 102(b) "unless specifically
  appropriated later"; Sec. 106(1) "The enactment into law of an appropriation for any project or activity"; PRIMER
  "each year Congress must pass new spending bills". It is a reasonable inference, not a statement in any source.
  Not contradicted.

### S6 — plainEnglish list of exceptions (first reading had only the CRS line for those after Sec. 122) — VERIFIED
- Summary: "with exceptions for food aid for women and children, disaster relief, small business loans, Indian Health
  Service, and wildfire response."
- Official text: Sec. 116 (WIC, "may be apportioned at the rate for operations necessary to maintain participation");
  Sec. 122 (FEMA Disaster Relief Fund, "may be apportioned up to the rate for operations necessary to carry out response
  and recovery activities"); Sec. 118 (Small Business Administration Business Loans Program Account); Sec. 123 (Indian
  Health Service, above); Sec. 125: "Amounts made available by section 101 for ``Department of the Interior--
  Department-Wide Programs--Wildland Fire Management'' and ``Department of Agriculture--Forest Service--Wildland Fire
  Management'' may be apportioned up to the rate for operations necessary for wildfire suppression activities."
- "wildfire response" for "wildfire suppression activities" is a fair plain paraphrase.

## Other core items from the first reading, re-read against the fuller text (not on the list to settle)

- C4, howItWorksToday item 5, "Current law sets timing rules for dividing approved money among agencies." The timing
  rules are VERIFIED: 31 U.S.C. 1513(b)(1) "The information shall be submitted not later than the later of the
  following: (A) 40 days before the beginning of the fiscal year ... (B) 15 days after the date of enactment"; (b)(2)
  the President shall notify the agency head "not later than the later of ... (A) 20 days before the beginning of the
  fiscal year ... (B) 30 days after the date of enactment". The words "among agencies" are NOT what the text says:
  31 U.S.C. 1512(b)(1) "An appropriation subject to apportionment is apportioned by (A) months, calendar quarters,
  operating seasons, or other time periods; (B) activities, functions, projects, or objects; or (C) a combination".
  Apportionment spreads each appropriation over time or activities; it does not divide money among agencies. Loose
  gloss, as the first reading said; the fetched 1512 text confirms the gloss is inexact.
- C5, "but keeps other spending-control rules": unchanged. Sec. 108 keeps "any other provision of law governing the
  apportionment of funds", narrower than the summary's words.
- C2, plainEnglish, "amid a fight over immigration-enforcement limits": the complete floor record (no gaps) shows both
  managers arguing the point, so a dispute on the floor is in the record: Rep. DeLauro, H4734, "At minimum, I cannot
  support this bill without the inclusion of the technical language regarding the Border Patrol that was agreed upon in
  April"; "We said no money for Border Patrol unless there would be the protections" (H4735); Rep. Cole, H4736, "Why the
  Border Patrol is mixed up in this, I will never know, but I am happy to talk to my friends about it on the other
  side." The phrase "immigration-enforcement limits" is the summary's own; the record speaks of Border Patrol funding
  and "protections". Still a characterisation rather than a quoted fact; first reading's minor finding stands.
- Not in the summary but now readable in the bill: Sec. 124, Sec. 126 (TANF through December 4), Sec. 127 (two $174,000
  payments), Sec. 128 (no Member cost-of-living adjustment). Nothing in the core contradicts them.

## Result

- Indian Health Service row: both figures, what each is for, and the three years all match Sec. 123.
- One misstatement in core: "full-year" in changes row 1 (Sec. 106(1) says "an appropriation", any appropriation).
- One core statement no official text supports: changes row 3 "today" ("New yearly spending laws could fund new
  projects if Congress passes them").
- CORE RESULT: HAS MISSTATEMENT (one added word, minor) and one unverifiable "today" line.
