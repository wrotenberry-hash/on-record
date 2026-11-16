# Weekly sentiment email for legislative offices (design only; not sent)

Round J asks for a design, not a send. Nothing here is built to go out; the
preview lives at Editor → Office email (`/editor/office-email?member=<bioguide>`).

## What it says

- To: the office's public contact address (from the member's official site), only
  after the owner approves sending and the public switch is on.
- Subject: "On Record: what verified constituents in TX-07 said this week".
- For each bill the member voted on this week and each bill on next week's floor
  schedule: the bill (official title, link), the member's recorded vote (Official),
  and district-matched totals (support / oppose, n) with real-people national
  totals beside them, only where n ≥ 25.
- Every total is labelled "Not a scientific poll", with the tiers explained in one
  line and a link to the monthly transparency note.
- No names, no reasons text, no individual answers, no emails of constituents.
  Aggregates only, the same template for every office and party.

## Rules

- Same content for every office; no office gets a different cut of the data.
- Sent weekly at most; one-click opt-out for the office; never sold or shared
  with campaigns, parties or PACs.
- Held back entirely while any open integrity flag touches the bills included.

## Before it can be sent (owner decisions)

1. Public reading on (the switch), 2. a verified sending domain, 3. the owner's
   go-ahead for outreach to offices.
