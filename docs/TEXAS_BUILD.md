# Texas build (owner instruction, 17 Nov 2026, verbatim)

> Prioritize Texas now, in parallel with federal summary coverage. Texas must be fully live before the session convenes 12 Jan 2027.
>
> 1. Data: Open States API (key will be in OPENSTATES_API_KEY; build with mocks until it is) for TX legislators, committees, bills, actions and recorded votes; LegiScan as fallback; Texas Legislature Online as source of record. Ingest prefiled 2027 bills now.
> 2. Address lookup returns state senator and state representative alongside federal members.
> 3. Summaries: same standard and average-reader test. Allowed sources add House Research Organization and Senate Research Center bill analyses and Legislative Budget Board fiscal notes. Only summarize bills that get a committee hearing, a vote, or that a user follows.
> 4. Clearly label when a Texas vote was a voice vote or isn't individually recorded; never imply a member's position without a recorded vote.
> 5. Texas primers: how the Legislature works, Lt. Governor and Speaker roles, the session calendar, special sessions.
> 6. Texas dashboard (same as Congress) with 2021–2025 sessions backfilled.
> 7. Report progress and a Texas go-live date in your next status.

Standing rules still apply (docs/OPERATING_RULES.md): new tables only, nothing public beyond trial invites, spend caps,
neutral wording, no secrets in chat. Decisions are logged in docs/DECISIONS.md from O-135.

## Where Texas stood when the instruction arrived (probe, 17 Nov 20:28 UTC)

- The Open States key is set in production. 178 of 181 members on file (Senate district 22 and House districts 1 and 93 are not in the source's list).
- 20 committees stored, all with chamber unknown; 210 memberships.
- 120 bills, all from the 89th Legislature's 2nd called session; 194 recorded votes; no tally mismatches.
- No 2027 bills: the source names the session "90R" and the site looked for "90" (fixed the same day).
- No LegiScan key. Texas summaries are in the old format and switched off for readers.
