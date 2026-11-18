# Weekly email for legislators' offices

Owner instruction, 18 Nov 2026, point 7 (`docs/CONSTITUENT_VOICE.md`): "a weekly email before floor votes.
Aggregates only, same 25-voter threshold." This replaces the Round J design of 16 Nov (O-81), which was a preview
page with its own wording. There is now one design and one piece of code for the words:

| Piece | Where |
|---|---|
| The words (subject and body), as a pure function | `lib/office/email.ts` (`composeOfficeEmail`) |
| Who gets it, when, and the record of each attempt | `lib/office/store.ts` (`sendOfficeEmails`) |
| The switch, the cap and the mailer | `lib/office/weekly.ts` (`runOfficeEmails`) |
| The same email, shown to the editor for any member | Editor → Offices → "See the email" (`/editor/office-email`) |
| Tests | `tests/office.test.mjs` |

## What changed from the 16 Nov design

- It goes only to an office that **signed in** with a government email address and was confirmed. The old design
  sent it, unasked, to the office's public contact address. Nothing is sent to an office that did not sign up.
- It shows the member's **own district only** (a U.S. senator's state). The old design put national totals beside
  the district's; the owner's instruction is "only voters from that legislator's own district".
- Unsure is a counted answer, and the two groups (mail-verified, address-matched) are listed separately,
  mail-verified first. The words "verified constituents" are gone: address-matched is never called verified.

## It is off

Nothing is sent unless `OFFICE_EMAIL_ENABLED` is set to `1` in Vercel. With the switch off the sender reads nothing
and sends nothing. It is also not yet called by the scheduled update: that needs one line, which the lead adds when
the owner says go. At most 50 emails go out in one run (`OFFICE_EMAIL_MAX_PER_RUN` changes the number). Email goes
through the site's one mailer, which cannot deliver to offices until the site's sending domain is verified.

## Who gets it

- An office account that is **confirmed** (its address named the office, or the editor confirmed it) and whose
  member still holds the seat.
- Only while the account has the weekly email **on**. It is on when an office signs up. The office stops it with the
  link at the bottom of every email, or with the switch on its dashboard. The link opens a page with one button;
  the button, not the link, stops the email, so a mail system that opens every link in a message cannot switch it
  off by accident.
- Once a week at most (weeks start on Monday). A failed attempt is tried again on a later run in the same week;
  a successful one is never repeated. Every attempt is one row in `office_email_sends`.

## What it says

The email is written from the office's own dashboard (`officeDashboard`), so it can never say more than the
dashboard shows.

- To the office of the member, by seat and name.
- "Not a scientific poll." Then who is counted: mail-verified and address-matched residents of the member's own
  district, mail-verified first.
- **Coming up**: each bill on the floor schedule (Congress), or set for a hearing or moved in the last two weeks
  (Texas), that has **25 or more counted voters** in the district: the bill, why it is listed, the number of voters,
  the two groups, and the member's own recorded vote if there is one. Bills below 25 are not named; one line says
  how many there are.
- **Voted on in the last 7 days**: the same, for bills the member cast a recorded vote on.
- A link to the dashboard, where everything can be downloaded or printed.
- A link to stop the email.

## Rules

- The same template for every office and every party. The code that writes it never reads a party.
- Totals only: no name, no individual answer, no reason, no reader's email.
- Never sold, and never shared with campaigns, parties or political committees.
- Not sent when no bill in it has a total: an office is never emailed to be told there is nothing to tell.
- Not sent while answers on one of its bills are set aside by a flag the editor has not decided (Editor → Flagged
  answers). It goes on the next run after the flag is decided.
- No grades, no praise or blame, and no comparison of the member's vote with the totals: the vote and the totals are
  printed side by side and nothing is said about them.
- Free. No payment, plan or upgrade is mentioned anywhere.

## Before it can be sent (owner decisions)

1. A verified sending domain (the same step reader emails are waiting for).
2. The owner's go-ahead to email offices: set `OFFICE_EMAIL_ENABLED=1`, and the lead adds the one line to the
   scheduled update.
3. Whether the email should be on for an office from the day it signs up (it is today; the table was built with
   that default) or off until the office turns it on.
