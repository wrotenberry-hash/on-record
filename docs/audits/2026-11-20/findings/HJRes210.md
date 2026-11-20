# Audit findings: H.J.Res. 210 (119-hjres-210)

Packet: `packets/HJRes210.txt` (84 lines, 25,311 chars; read in full).
Sources present: CITED Full text (engrossed resolution), CONTEXT, HEADINGS, SOURCE CRS, SOURCE FLOOR (Guthrie, Matsui, Fong, Lofgren, Kiley), SOURCE STATUS.
Sources absent: no SOURCE REPORT, SOURCE RULE, SOURCE CBO, SOURCE USC. No section is marked MISSING, but Rep. Matsui's floor text has an elision `[…]` (see Limits).

**VERDICT: MINOR ONLY**

- CORE: 0 MISSTATES, 15 MINOR (8 wording/credit findings + 7 "about the sources" sentences in the changes rows)
- EXTENDED: 0 MISSTATES, 10 MINOR (7 wording/credit findings + 3 "about the sources" sentences in unknowns)

---

## CORE findings

### C1. headline | CONDITION DROPPED / EXACT WORD CHANGED | MINOR
- Summary: "Blocks California rules for docked cargo ships and oil tankers."
- Source (CRS): "This joint resolution revokes the authorization granted to the California Air Resources Board (CARB) to amend its Ocean-Going Vessels At-Berth Regulation. Among other elements, the amendment ... expanded auxiliary engine emissions reductions requirements to include additional categories of ocean-going vessels."
- Source (FLOOR, Kiley): "I take no issue at all with California's longstanding program of 20 years that requires container ships, passenger ships, and reefer ships to plug in".
- Why: the resolution nullifies the federal authorization of an amendment (the expansion), not "California rules for docked cargo ships" as a whole. The headline drops the "expanded / amendment" limit and turns "revokes the [federal] authorization" into "blocks California rules". The plainEnglish paragraph straight after it states this correctly, so the reader is corrected at once; rated MINOR, but it is the loosest sentence in the core.

### C2. plainEnglish | WRONG CREDIT (+ CONDITION DROPPED) | MINOR
- Summary: "opponents say it cuts cancer risk near ports by up to 55 percent and saves $2.3 billion in health costs."
- Source (FLOOR, Matsui only): "This simple solution is expected to reduce cancer risk in communities living near major ports by as much as 55 percent and save $2.3 billion in public health costs."
- Why: only Rep. Matsui gave these figures. The other opponent who spoke (Rep. Lofgren) did not. One member's numbers are credited to "opponents". "is expected to" is also dropped ("cuts", "saves"). The changes row "Health effects near ports" credits it correctly to Rep. Matsui and keeps "is expected to".

### C3. howItWorksToday[0] | WRONG CREDIT (stated as plain fact, wrong source tag) | MINOR
- Summary: "Large ships at California ports can run diesel generators while docked." (section tag: CRS)
- Source (FLOOR, Matsui): "When those ships dock at California's ports, they are running diesel generators day and night."
- Why: CRS says nothing about diesel generators; this is Rep. Matsui's description, given as plain fact and tagged CRS. The second sentence of the same item ("California regulates that pollution and asks the federal government for permission to enforce some engine standards") does rest on CRS ("the EPA may authorize California to adopt and enforce standards relating to the control of emissions from nonroad vehicles or engines if those standards meet certain requirements").

### C4. howItWorksToday[1] and changes[0].today | NO SOURCE (date given a meaning the source does not give it) | MINOR
- Summary: "The federal government approved California's changes on October 20, 2023." / "The federal government approved California's expanded rule on October 20, 2023, covering more ocean-going vessels while docked."
- Source (Full text): "``California State Nonroad Engine Pollution Control Standards; Ocean-Going Vessels At-Berth; Notice of Decision'' (88 Fed. Reg. 72461 (October 20, 2023))".
- Source (FLOOR, Fong): "In 2023, the Biden EPA approved a waiver".
- Why: the only place the packet gives 20 October 2023 is as the date in the Federal Register citation of the notice of decision. No source says the approval was made on that day; the floor source says only "In 2023". Probably harmless, but the packet supports "published/dated October 20, 2023" or "in 2023", not "approved on".

### C5. howItWorksToday[4] | CONDITION DROPPED ("as estimated by") | MINOR
- Summary: "Rep. Fong said the rule can bring fines of about $50,000 per vessel per day and has about $2.3 billion in compliance costs through 2032."
- Source (FLOOR, Fong): "CARB estimates approximately $2.3 billion in compliance costs through 2032."
- Why: "CARB estimates" is dropped, so the figure reads as Rep. Fong's own statement of what the rule "has". The changes row keeps the estimate ("California estimates"). The fines half matches: "Companies that don't comply face fines of approximately $50,000 per vessel per day."

### C6. changes[3].today (Compliance costs and fines) | WRONG CREDIT (ambiguous) | MINOR
- Summary: "Rep. Fong said California estimates about $2.3 billion in compliance costs through 2032, and noncompliance fines of about $50,000 per vessel per day."
- Source (FLOOR, Fong): "Companies that don't comply face fines of approximately $50,000 per vessel per day." ... "CARB estimates approximately $2.3 billion in compliance costs through 2032."
- Why: as written, the sentence reads as if California also estimates the fines; the fine figure is Rep. Fong's own statement, not a CARB estimate. "CARB" given as "California" is acceptable (Fong: "the California Air Resources Board, or CARB").

### C7. changes[3].ifPassed | NO SOURCE (consequence stated as fact) | MINOR
- Summary: "Those costs and fines tied to the expanded approved rule would not apply through that approval."
- Source: no source states this in these terms. Closest (FLOOR, Fong): "My legislation is simple: Stop this unworkable mandate from driving up costs". Rep. Matsui disputes any saving: "Nullifying this waiver does nothing to save Americans money" and "repealing protections that are already working will lead to billions in stranded assets at ports across the State."
- Why: a supporter's expected result is given as plain fact; the hedge "through that approval" keeps it close to the bill text ("such rule shall have no force or effect"), hence MINOR.

### C8. changes[4].ifPassed (Health effects near ports) | EXACT WORD / WRONG REFERENT | MINOR
- Summary: (today) "reduce cancer risk near major ports by up to 55 percent and save $2.3 billion in public health costs." (ifPassed) "Rep. Matsui said those health benefits would be lost."
- Source (FLOOR, Matsui): "it is estimated to be only $3 per year for the average California driver, for $2.4 billion in net public health benefits. Those benefits would be lost if this resolution is enacted."
- Why: what Rep. Matsui said "would be lost" is the "$2.4 billion in net public health benefits", a different figure from the 55 percent / $2.3 billion pair the row points back to. Same speaker, same drift of meaning; MINOR.

### C9. changes rows | ABOUT THE SOURCES | MINOR (7 sentences)
All seven are wording about the sources rather than about the bill:
1. changes[1].ifPassed: "The sources do not say exactly which older requirements would remain."
2. changes[2].before: "The sources do not give a full before-rule count of ships using dock electricity."
3. changes[2].ifPassed: "The sources do not estimate future use of dock electricity."
4. changes[3].before: "The sources do not give costs under the older California program."
5. changes[3].ifPassed: "The sources do not give a replacement cost estimate."
6. changes[4].before: "The sources do not give cancer-risk numbers under the older program."
7. changes[4].ifPassed: "The sources do not give an agency estimate for cancellation."

Three of the five `before` cells contain nothing except such a sentence.

---

## EXTENDED findings

### E1. whatChangesForYou (second sentence) | CONDITION DROPPED + NO SOURCE (consequence) | MINOR (most serious extended item)
- Summary: "A California driver could avoid costs that Rep. Matsui said equal about $3 per year if fully passed on."
- Source (FLOOR, Matsui): "The cost of compliance with the At-Berth Rule is estimated to be a fraction of a cent per gallon of fuel. Even if this were to be entirely passed through consumers, it is estimated to be only $3 per year for the average California driver, for $2.4 billion in net public health benefits." and "Nullifying this waiver does nothing to save Americans money."
- Why: "estimated" and "average" are dropped ("equal about $3", "A California driver"). More important, the speaker whose figure is used said the resolution saves nothing and would make "consumer prices ... skyrocket even more"; the idea that a driver "could avoid" the cost is the supporters' claim (Kiley: "it will stop gas prices from getting even higher in California"), who put it far higher ("literally billions of dollars ... passed on to consumers"). No source says a driver would avoid about $3. Kept at MINOR because the figure, the credit for the figure and the "if fully passed on" condition are all right and "could" hedges the consequence.

### E2. whatChangesForYou (first sentence) | CONDITION DROPPED | MINOR
- Summary: "could lose a rule that Rep. Matsui says cuts cancer risk by up to 55 percent."
- Source (FLOOR, Matsui): "is expected to reduce cancer risk in communities living near major ports by as much as 55 percent".
- Why: "is expected to" dropped; "near major ports" narrowed to nothing. Credit is right.

### E3. caseFor[1] (Rep. Kiley) | WRONG CREDIT / EXACT WORD CHANGED | MINOR
- Summary: "He says tanker technology is not ready at the needed scale, so fines could add billions of dollars and raise gasoline prices in California."
- Source (FLOOR, Kiley): "The problem is the technology for them just isn't there yet, so virtually none of them are going to be able to comply."
- Source (FLOOR, Fong): "the technology and infrastructure needed to comply simply do not exist at the scale this mandate demands."
- Why: "at the needed scale" is Rep. Fong's point; Rep. Kiley said the tanker (boiler) technology "just isn't there yet". The rest matches Kiley: "racking up thousands of dollars in fines, which could accumulate to literally billions of dollars, which, of course, will be passed on to consumers in the form of higher prices for gasoline."

### E4. whoItAffects[0] | WRONG CREDIT (stated as plain fact) | MINOR
- Summary: "where large docked ships can run diesel generators day and night."
- Source (FLOOR, Matsui): "When those ships dock at California's ports, they are running diesel generators day and night."
- Why: one member's description, given as fact. Same point as C3.

### E5. whoItAffects[1] | WRONG CREDIT (stated as plain fact) + NO SOURCE (one item) | MINOR
- Summary: "Ship operators, ports, utilities and tanker operators that face equipment costs, operating changes or fines under the expanded rule."
- Source (FLOOR, Guthrie): "These expensive regulations on tanker ships, ports, utilities, and operators ... the compliance costs, including installing electric charging equipment to power tanker ships". (FLOOR, Fong): "Companies that don't comply face fines of approximately $50,000 per vessel per day."
- Why: the list of who bears costs is Rep. Guthrie's claim and the fines are Rep. Fong's, given as plain fact. "operating changes" is not said by any source in those words (closest is the plug-in requirement itself).

### E6. structure.whyNow | NO SOURCE (date meaning) | MINOR
- Summary: "to cancel the October 20, 2023 federal approval of California's expanded docked-ship pollution rule."
- Source (Full text): "(88 Fed. Reg. 72461 (October 20, 2023))".
- Why: same as C4; the date is the Federal Register citation date. The rest of whyNow matches STATUS: "On passage Passed by the Yeas and Nays: 216 - 211 (Roll no. 306)" on September 15, 2026 and "September 16, 2026: Received in the Senate."

### E7. details.question | CONDITION DROPPED | MINOR
- Summary: "Do you support blocking California rules for docked cargo ships and oil tankers?"
- Source (CRS): "revokes the authorization granted to the California Air Resources Board (CARB) to amend its Ocean-Going Vessels At-Berth Regulation."
- Why: same as C1; the question asks about "California rules" in general, not the federal approval of the expansion.

### E8. unknowns | ABOUT THE SOURCES | MINOR (3 sentences)
1. "The Federal Register record was not available in the sources, so the exact rule text is not shown."
2. "The sources do not say exactly which older California port requirements would remain if this passes."
3. "No Congressional Budget Office cost estimate is listed." ("is listed" is wording about the record; the packet has no SOURCE CBO, so it is not false.)

(Not reader-facing as far as the brief lists, but the same wording appears in `confidenceReason`: "were not available in the provided sources".)

---

## Checked and found to match (no fault)

- plainEnglish "the House passed it 216-211 on September 15, 2026" = STATUS "Passed by the Yeas and Nays: 216 - 211 (Roll no. 306)", September 15, 2026.
- plainEnglish "more docked ocean ships must cut diesel pollution, including more vessel types than before" = CRS "expanded auxiliary engine emissions reductions requirements to include additional categories of ocean-going vessels."
- plainEnglish "Supporters say the rule raises shipping and fuel costs" = Fong ("costly shipping mandates", "drives prices even higher"), Guthrie ("raise the price of all goods"), Kiley ("higher prices for gasoline"). More than one supporter, so "supporters" is fair.
- howItWorksToday[2] "More than 30 percent of container cargo ... Rep. Matsui said" = Matsui "More than 30 percent of all container cargo arriving in the U.S. passes through California's ports".
- howItWorksToday[3] / changes[2].today "over 95 percent compliance in 2025" = Matsui "Industry has already achieved over 95 percent compliance with this rule in 2025." "shore power, meaning electricity from the dock" = Matsui "run the ship on electricity supplied by the port". (3,400 figure: see Limits.)
- changes[0].before and changes[1].before, Kiley's "longstanding program of 20 years that requires container ships, passenger ships, and reefer ships to plug in": credited to Rep. Kiley correctly. "refrigerated cargo ships" for "reefer ships" is a plain-language gloss the packet itself does not define; not counted.
- changes[0].ifPassed "would have no force or effect" = Full text "such rule shall have no force or effect".
- changes[1].today "speakers identified oil tankers and roll-on/roll-off vessels as affected": tankers named by Guthrie, Matsui and Kiley; roll-on/roll-off vessels named only by Kiley. Not counted.
- changes[4].today: matches Matsui and keeps "is expected to".
- whatItDoes (all three) = Full text and CRS.
- whoItAffects[2] "roughly 40 percent of United States containerized imports", credited to Rep. Fong = Fong "California ports handle roughly 40 percent of our Nation's containerized imports."
- caseFor[0], credited "Rep. Vince Fong, the sponsor" = Fong "my Congressional Review Act resolution"; Guthrie "this resolution led by Representative Vince Fong"; content matches "When California raises the costs of moving goods, Americans across the country pay the price."
- caseAgainst[0] (Matsui) matches; "could cut" for "is expected to reduce" keeps the meaning.
- caseAgainst[1] (Lofgren) = "a Federal court has ordered the EPA to withdraw or correct the reclassifications of all six Clean Air Act section 209 waiver orders ... because EPA violated the law in labeling them as rules"; "the court ordered EPA to undo its illegal actions specifically with respect to these two maritime waivers"; "Congress should reject this illegal overreach".
- All attributions used are on the CONTEXT allowed lists.

## Limits

- Rep. Matsui's floor text is cut in the packet: "The reality is that over 3,400 vessel visits used shore-power […] price of diesel is at a record high". The end of the 3,400 sentence (period covered, any qualifier such as other compliance methods) is missing, so "more than 3,400 vessel visits used shore power" (howItWorksToday[3], changes[2].today) is confirmed only as far as the visible words. Whatever else she said in the gap could not be checked.
- The packet header says SOURCE FLOOR has 9 parts; five speakers' statements are shown. CONTEXT notes "No floor statements were found at Congressional Record H5825 (2026-09-15)."
- CONTEXT notes the Federal Register record "could not be found", so nothing about the content of the EPA decision or the California amendment could be checked beyond the CRS summary. The meaning of the 20 October 2023 date (C4, E6) could not be settled for that reason.
- No committee report, rule, CBO or U.S. Code source is in the packet.
