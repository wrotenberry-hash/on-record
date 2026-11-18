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

## Status, open decisions and what is not proven

Kept current in `STATUS.md`, `docs/DECISIONS.md` (from O-147) and Editor → What's next.
