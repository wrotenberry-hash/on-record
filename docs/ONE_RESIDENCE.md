# One person, one residence

Owner instruction, 18 Nov 2026, verbatim:

> Enforce one person, one residence in constituent voice:
> 1. One account per phone number (store only a hash). A phone number cannot be attached to a new account for 90 days after its account is deleted.
> 2. One active home address per account. Setting a new address replaces the old one; allowed once every 90 days. An account is counted in exactly one congressional district, one state senate district and one state house district at any time.
> 3. Household cap: at most 6 counted accounts per normalized address; require a unit number where the official address database shows multiple units. Over the cap, new accounts can read and follow but are not counted until reviewed.
> 4. A mailed code can be redeemed by one account only, and redeeming it for an address removes mail-verified status from any other account previously verified at a different address with the same phone hash.
> 5. Fraud signals for review (quarantine, never delete): the same device or network creating accounts at many addresses, clusters of new accounts in one district right before a vote, repeated address changes.
> 6. Tests: one phone cannot hold two counted accounts; one account cannot be counted in two districts; an address change after voting does not move past votes.

## Where it lives

| What | Where |
|---|---|
| The rules, as pure functions | `lib/verify/residence.ts` |
| The database side (same functions the tests run) | `lib/verify/residence-store.ts` |
| Phone and address steps, counted answers | `lib/verify/flow.ts` |
| Totals | `recomputeBillTotals` (called by `recomputeBill` in `lib/verify/store.ts`) |
| Seven new tables, nothing altered | `drizzle/0035_one_residence.sql` |
| Tests (14, against a temporary database built from the real migrations) | `tests/residence.test.mjs` |
| Phone task (a reader sees the three districts; an early change is refused) | task 15 in `tests/e2e/tasks.mjs` |
| Editor review | Editor → Flagged answers → "Accounts set aside" (`/editor/integrity#accounts`) |

Verification as a whole is still switched off in production (`VERIFICATION_ENABLED`), so none of this touches a reader until the owner turns it on.

## How each point is enforced

1. **One account per phone.** The database refuses a second profile with the same phone hash (unique index, since migration 0018). Only a keyed hash is stored. When an account is deleted its phone hash moves to `phone_holds` with no account id and an end date 90 days out; the phone step refuses that number until then; the row is deleted when the 90 days are up.
2. **One address.** `account_residences` has the account as its primary key, so a second row cannot exist; a new address overwrites the old one. A different address is refused until 90 days after the last one was set (saving the same address again is not a change). The row holds one congressional district, one state senate district and one state house district, all from the same Census answer.
3. **Household cap.** The address is normalized (the Census Bureau's standard form of the street address, five-digit ZIP, unit reduced to letters and digits) and stored only as a keyed hash. The seventh account at one normalized address is set aside (`account_holds`, reason `household_cap`): it reads and follows, its answers are saved, and none count until the editor clears it. A different unit is a different household.
   **Unit numbers.** The check against the official address database is built for the Postal Service's Addresses API (documented answers: "D" = unit missing, "S" = unit given but not confirmed) and is **off**: see "Decisions for the owner". While it is off, a unit the reader types is kept, and a building whose residents leave the unit out is held to six accounts by the cap.
4. **Mailed codes.** A code is stored as a keyed hash, tied to one account and the address it is mailed to. It can be redeemed once, by that account, while the account still lives there, within 45 days. Redeeming records the phone hash; any other account that is mail-verified at a different address with the same phone hash loses that status (the record is kept and marked). Moving ends an account's own mail-verified status. **Sending a code is not built**: it needs a mail provider and a spending limit from the owner.
5. **Signals for review.** Each sets the account aside (never deletes) until the editor clears or confirms it:
   - one device setting homes at 3 or more different addresses in 30 days, or one network range at 6 or more in 7 days (a family on one device at one address is not flagged);
   - 10 or more accounts under 7 days old arriving in one district within 72 hours, at least 5 times that district's usual rate, when a vote is expected within a week (federal: a bill is on a floor schedule; state: the Texas Legislature is in session);
   - the third address change within a year, or three refused attempts within 30 days.
   A hold the editor has cleared is not raised again by the same pattern.
6. **Past votes do not move.** Each counted answer is stamped once (`position_residences`) with the districts the account lived in when the answer first had a home, and the stamp is never updated. Totals read the stamp, not the account's current address.

## Defaults I chose (change any of them by saying so)

- Mailed code valid for 45 days.
- Thresholds in point 5 (3 addresses per device in 30 days; 6 per network in 7 days; 10 new accounts in 72 hours at 5 times the usual rate; third change in a year).
- An account that is set aside is not counted anywhere, including the national "real people" total.
- An answer given before the account had any address takes the first address the account sets.
- No grace period for fixing a typo in an address: the 90-day rule applies from the first save. The account page says to check the address before saving.

## Decisions for the owner

1. **Which official address database for unit numbers.** The Postal Service's own check can say when a unit is missing, but its terms say use is "for the sole purpose to facilitate and manage USPS shipping and/or mailing transactions" (developers.usps.com/terms-and-conditions, read 18 Nov 2026). Checking an address before mailing it a code fits that; using it only to enforce the household cap may not. Options: (a) turn it on together with mailed codes, after the lawyer agrees; (b) a paid address service whose terms allow verification. To turn on (a): free account at developers.usps.com, then in Vercel set `ADDRESS_AUTHORITY=usps`, `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET`.
2. **Mailed codes.** Provider and monthly spending limit (postcards cost roughly a dollar each). Until then mail-verified status exists only as rules and tests.
3. **Privacy and terms drafts** now say: a deleted account's phone fingerprint is kept for 90 days; a fingerprint of the normalized address is kept; each address change is logged with a scrambled device and network (cleared after 30 days). These are marked for the lawyer.

## Not proven

- The Postal Service check has never been called; it is written from the published specification (version 3.3.1) and tested on documented answers only.
- No real reader has gone through the flow: verification is off in production. The phone task runs it with local stand-ins for the text message, the bot check and the Census service.
