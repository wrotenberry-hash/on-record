# Constituent voice: one consolidated build

Owner instruction, 18 Nov 2026. It replaces Round J and every constituent-voice prompt sent on 18 Nov (so it supersedes
`docs/ONE_RESIDENCE.md` where the two differ). Verbatim, as received; the message ended inside point 10.

> CONSTITUENT VOICE — ONE CONSOLIDATED BUILD (replaces Round J and every constituent-voice prompt sent on 18 Nov). Same neutrality, privacy, spend and stop rules as the master plan.
>
> GOAL: residents vote on individual bills, everyone sees the totals, and legislators get ready access to what their own constituents want.
>
> 1. FIX THE PROMISE FIRST
> - The bill page says "Only you see this. It is never shown to anyone else or added up into a poll." Replace with: your individual vote is private; counted votes are added into anonymous totals.
> - Votes cast before this change stay uncounted unless the user opts in on their next visit. Update the privacy policy draft to match.
>
> 2. VOTING
> - Support / Oppose / Unsure on every bill, with an optional private reason (280 characters). Neutral question using the plain headline; official title one tap away. Users can change their vote; keep history.
>
> 3. WHO MAY VOTE (JURISDICTION)
> - A vote counts only if the voter's home address is inside the bill's jurisdiction. Federal bills: any U.S. state or DC address. State bills: an address in that state only. Store each bill's jurisdiction explicitly so new states need no code changes.
> - People outside the jurisdiction can read the bill and see totals; the vote buttons are replaced with a plain line saying who can weigh in.
> - U.S. territories: residents may vote on federal bills, shown as their own group.
>
> 4. LOCATION VERIFICATION (two tiers, named honestly)
> - "Address-matched": address validated as a real residential address by an official geocoder, plus an SMS code. Never call this "verified."
> - "Mail-verified": address-matched plus a 6-character code from a mailed postcard (expires in 30 days, max 2 postcards per address per year, one account per code). Build now behind a flag with a mock; compare postcard vendors and give me the real per-piece cost before sending any. Free to users, optional, prompted after the third counted vote, capped at $100 a month until I raise it.
> - Accounts with only a phone can read, follow and save a private position, but are not counted in any total.
> - Device location and IP are fraud signals only: never a block, never stored beyond fraud review.
> - Do not build voter-roll matching or ID scanning.
>
> 5. ONE PERSON, ONE RESIDENCE
> - One account per phone number (store a hash only). A number cannot join a new account for 90 days after its account is deleted.
> - One active home address per account; a new address replaces the old one; changes allowed once every 90 days. An account is counted in exactly one congressional district, one state senate district and one state house district.
> - Past votes stay with the district they were cast in; new votes follow the new address.
> - Household cap: at most 6 counted accounts per normalized address; unit number required where the address database shows multiple units. Over the cap: readable, not counted until reviewed.
>
> 6. RESULTS EVERYONE CAN SEE
> - After a user votes, show totals for the nation (federal bills), their state and their district: Support / Oppose / Unsure with the number of voters, mail-verified and address-matched shown separately, mail-verified first.
> - District totals appear only at 25 or more counted voters; otherwise "Not enough constituents yet — share this bill."
> - Always labeled "Not a scientific poll." Never show individual votes or reasons.
> - On each bill page, show each legislator's actual vote beside their district's total once they have voted.
>
> 7. LEGISLATOR ACCESS (free, never paid, identical for every party)
> - Office dashboard unlocked by verifying an official government email (house.gov, senate.gov, senate.texas.gov, house.texas.gov; list the domains you use).
> - Shows only voters from that legislator's own district: totals on upcoming and recent bills, trend over time, top issues, CSV/PDF export, and a weekly email before floor votes. Aggregates only, same 25-voter threshold.
> - Keep the public legislator page (district totals beside their votes) so access never depends on an office signing up.
>
> 8. ABUSE CONTROLS
> - Accounts must be 24 hours old before votes count. Rate limits; disposable-email blocklist.
> - Quarantine for review (never delete): one device or network creating accounts at many addresses, bursts of new accounts or address changes into one district before a vote, identical reason text.
> - Editor page to clear or confirm flags. Monthly public transparency note with aggregate counts.
>
> 9. ASSOCIATIONS
> - May see totals only for their own verified members, aggregates only.
>
> 10. TESTS (must pass before release)
> - A non-Texas address cannot be counted on a Texas bill

## How it is built

One table holds every answer on every bill (`voice_votes`). Whether an answer counts is worked out, not stored: the
same pure rule (`voteCounts` in `lib/voice/rules.ts`) is applied each time a bill's totals are rebuilt.

| Piece | Where |
|---|---|
| Rules, as pure functions (who counts, where, which tier, what may be shown) | `lib/voice/rules.ts` |
| Database side (the same functions the tests run) | `lib/voice/store.ts` |
| One person, one residence | `lib/verify/residence.ts`, `lib/verify/residence-store.ts` |
| Reader's own answers (one access layer) | `lib/opinions.ts` |
| Tables (new only) | `drizzle/0036_constituent_voice.sql` |
| Tests | `tests/voice-rules.test.mjs`, `tests/voice-store.test.mjs`, `tests/residence.test.mjs` |

### An answer counts when all of these are true

1. It was given after the promise changed, or the reader chose to count their earlier answers.
2. The account is address-matched (a text-message code, and a home address the Census Bureau's geocoder placed) or mail-verified. An account with only a phone is never counted.
3. The account is at least 24 hours old.
4. The home the answer was stamped with is inside the bill's jurisdiction (`bill_jurisdictions`): a federal bill counts any state or DC, with territories as their own group; a state bill counts that state only.
5. Neither the answer nor the account is set aside for review.

### Names of the two tiers

- **Address-matched**: never called "verified" anywhere a reader can see.
- **Mail-verified**: address-matched plus a code from a mailed postcard.

## What a reader sees

- On every bill, federal or Texas: the promise, the question (plain headline when a summary is on show; the official
  title one tap away), Support / Oppose / Unsure, an optional private reason, and "Your earlier answers".
- Outside the bill's jurisdiction: "People who live in Texas can weigh in on this bill. You can still read it and see
  the totals." in place of the buttons.
- After answering: totals for the nation (federal bills), the state and the reader's district, each with the number of
  voters, mail-verified first then address-matched, under "Not a scientific poll." Below 25 counted voters a district
  says "Not enough constituents yet — share this bill."
- Beside each of the reader's legislators' votes on the bill: that legislator's own district's total.
- On every legislator's page, federal and Texas: the district's totals beside the member's votes, for anyone.
- A returning reader who answered before the change is asked once, on the first page they open, whether to count those
  answers. "No" keeps them private for good; changing an answer later is a new vote under the new promise.

## Defaults chosen by the builder (say so to change any)

1. **Totals appear after the reader answers**, or at once for someone outside the jurisdiction. They are public on the
   legislator pages in any case.
2. **25 applies to every total**, not only districts (the nation and the state say "Not enough voters yet.").
3. **A group of fewer than 5 voters shows its size only** ("Mail-verified: fewer than 5 voters"), so one or two
   mail-verified voters' answers cannot be read off the page.
4. **Territory residents** are counted in a "U.S. territories" total, their territory and its district, and not in the
   national total of the states and DC.
5. **Unsure counts as a voter** toward the 25 and is shown as its own number.
6. **An answer given under the new promise by an account that is not yet address-matched** starts counting when the
   account becomes address-matched (no second consent is asked).
7. **An account set aside for review is counted nowhere** until the editor clears it.
8. **Rate limits and the bot check** still stop an answer from counting when they fail (the answer is saved as a
   private position and the reader is told to answer again). The place a device or internet address appears to be is
   never used to decide who may vote on a bill.
9. **A burst into a district** counts accounts under 7 days old and address changes that cross a congressional
   district line; the state-district check uses the same test because the change log does not hold state districts.

## Not proven, stated plainly

- **"A real residential address."** The Census Bureau's geocoder confirms that an address exists on a street and gives
  its districts. It does not say whether the address is a home or a business. The Postal Service's address check does
  (and can require a unit number), but it is switched off: its terms limit use to mailing. With mailed postcards now
  part of the product that use fits better; it is still the owner's and the lawyer's call. Until then "address-matched"
  means "an address the Census Bureau placed, not a PO box", and the household cap of six applies.
- **No real person has been address-matched.** Verification is off in production (the text-message and bot-check keys
  are not set). The phone suite runs the whole flow with local stand-ins.
- **Territories.** The rule is tested; whether the Census geocoder returns districts for every territory address has
  not been checked against the live service.
- Office dashboard, mailed postcards and associations are separate parts: see their own sections in `STATUS.md`.

## The three other parts

| Part | Where | State |
|---|---|---|
| Legislator office access (point 7) | `lib/office`, `app/office`, `docs/OFFICE_EMAIL_DESIGN.md`, Editor → Offices | Built and merged. Behind the same invite-only gate as the rest of the site. Weekly email built, not wired, off. |
| Mail-verified by postcard (point 4) | `lib/mail-verify`, `docs/POSTCARD_VENDORS.md` | Built and merged, switched off (`MAIL_VERIFICATION_ENABLED`). Rehearsal only; no vendor adapter. |
| Associations (point 9) | `lib/associations`, `app/association`, Editor → Associations | Built and merged, switched off (`ASSOCIATIONS_ENABLED`). |

Switches, all off in production today: `VERIFICATION_ENABLED` (address matching and counting), `MAIL_VERIFICATION_ENABLED`,
`POSTCARD_VENDOR` + `POSTCARD_API_KEY` + `POSTCARD_PIECE_COST_USD`, `POSTCARD_MONTHLY_CAP_USD` (100), `ASSOCIATIONS_ENABLED`,
`OFFICE_EMAIL_ENABLED`, `ADDRESS_AUTHORITY=usps` + its two keys.

## Status, open decisions and what is not proven

Kept current in `STATUS.md`, `docs/DECISIONS.md` (from O-147) and Editor → What's next.


## Revised item 1: answers on every bill, at every stage (owner, 20 Nov 2026)

Verbatim, as received:

> Revised item 1. Readers answer on every bill, at every stage, and every answer counts the same way.
>
> - Bill still pending: "Do you support...?" as now.
> - Bill settled (became law, failed, vetoed): "Do you agree with this law?" or "Would you have supported this bill?" One line under it: "This is settled, so your answer can't change it. It tells your legislators what their district thinks of it, and lets you see how often they vote the way you would."
> - Counting, verification tiers and the 25-per-district threshold apply to settled-bill answers exactly as to pending ones.
> - Legislator dashboard: show settled-bill opinion in its own section, labeled "District view of laws already passed", separate from "District view of pending bills". Never merge the two into one number.
> - After any answer on a bill that has had a vote, show the reader how each of their own legislators voted and whether it matched.
> - "Your record" page: a running count per legislator of how often they voted the way the reader answered. Private to the reader, shown as a count ("7 of 10"), never a grade, score or ranking, and never public.
> - Until counting is on and a legislator's office has signed in, wording says answers "will be included" in what legislators see, never that they are being seen now.
>
> Before I send invites outside Texas: test the address lookup with one address each in California, New York, Ohio and a single-district state like Wyoming. Confirm each returns the right two senators and representative, and tell me what a non-Texas reader sees where state content would be. If it shows anything empty or Texas-specific, replace it with one line: "State coverage starts with Texas. Your state is coming."

| Piece | Where |
|---|---|
| Which bills are settled, the two questions, the one line and its "will be included" forms | `lib/constituent/settled.ts`; `settled` on `BillWindow` (`lib/changes/window.ts`) |
| The reader's own legislators' votes after an answer | `ownVotesOnBill` in `lib/record/store.ts`; `components/voice/vote-box.tsx` |
| The office dashboard's two sections | `lib/office/rules.ts`, `lib/office/store.ts`, `components/office/dashboard-view.tsx`, `lib/office/email.ts` |
| The line for readers outside Texas | `lib/state-coverage.ts` |
| Tests | `tests/settled-answers.test.mjs`, `tests/office.test.mjs`, `tests/state-coverage.test.mjs` |
