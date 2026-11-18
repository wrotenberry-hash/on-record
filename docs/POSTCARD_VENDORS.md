# Postcard vendors: what one card costs

For the owner. Written 18 November 2026. You asked: "compare postcard vendors and give me the real per-piece cost
before sending any."

## The short answer

**No price is confirmed yet. Nothing has been mailed, and nothing can be mailed.**

On 18 November 2026 this machine was not allowed to open any of the four vendors' pricing pages. Each try ended the
same way: the network here does not let those sites through. So this page holds **no dollar figure at all**. Every
price cell below says "not confirmed", and names the page to read.

A web search did run. Its short summaries of those pages gave **different prices for the same card on different
pages or sites**, for every one of the four vendors. A summary is not the vendor's page, and the summaries did not agree with each
other, so none of those numbers is written here. That disagreement is the reason to read each page yourself, or to
let this machine read them (see "To finish this page").

The site is safe to leave as it is. Postcards are switched off. If they are switched on today, they run as a
rehearsal: nothing is mailed and nothing is charged. A real vendor cannot be used until someone writes the code that
talks to it, and that has not been done on purpose.

## What the site needs from a vendor

- One card at a time, ordered by the site when a reader asks. Tens of cards a month at first, not thousands.
- A 4 by 6 inch postcard sent First-Class, so it arrives well inside the 30 days the code works.
- A different 6-character code printed on each card.
- No name on the card. The site holds no names, so each card is addressed to "Current resident".
- A test mode that prints and mails nothing, to try the connection.
- A way to be sure one request is never mailed twice.
- A status the site can read back: accepted, mailed, returned.
- Clear rules on what the vendor keeps: it receives a home address and the code, nothing else.

## The comparison

Every cell marked **not confirmed** is a fact nobody has read on the vendor's own page during this work. Where a web
search summary said something that is not a price, it is given in the notes under the table, labelled as a summary.

| | Lob | PostGrid | Click2Mail | Stannp |
|---|---|---|---|---|
| Pages to read (found by search, not opened) | `https://www.lob.com/pricing` and `https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details` | `https://www.postgrid.com/pricing-print-mail/` and `https://www.postgrid.com/plans-and-pricing/` | `https://click2mail.com/by-service` and its postcard sheet `https://click2mail.com/media/downloads/pdf/c2m_postcards_products.pdf` | `https://www.stannp.com/us` and `https://stannp.com/us/solutions` |
| Page tried from this machine on 18 Nov 2026 | `https://www.lob.com/pricing`: refused, the network here does not allow `www.lob.com` | `https://www.postgrid.com/pricing/`: refused, `www.postgrid.com` not allowed | `https://click2mail.com/pricing`: refused, `click2mail.com` not allowed | `https://www.stannp.com/us/pricing`: refused, `www.stannp.com` not allowed |
| **Real cost of one 4x6 First-Class postcard, low volume** | **not confirmed** | **not confirmed** | **not confirmed** | **not confirmed** |
| Date and page the price was read on | none: not read | none: not read | none: not read | none: not read |
| Monthly minimum or platform fee | not confirmed | not confirmed | not confirmed | not confirmed |
| Address check included in the price | not confirmed | not confirmed | not confirmed | not confirmed |
| Delivery time | not confirmed | not confirmed | not confirmed | not confirmed |
| Sends a tracking or status event | not confirmed | not confirmed | not confirmed | not confirmed |
| What it keeps, and for how long | not confirmed | not confirmed | not confirmed | not confirmed |

### What the search summaries said (not prices, and not read on the vendors' pages)

Treat each line as a lead to check, not as a fact.

- **Lob.** The lowest plan was described as having no monthly subscription, with higher plans charging a monthly fee
  for a lower price per card. Its help page was described as carrying a notice that new prices took effect on
  1 November 2026, which means any older figure found elsewhere is out of date. The summaries gave two different
  prices for the same card on the lowest plan. Lob was described as sending status events for each card (for example
  "mailed" and "in transit") to an address the site gives it. Whether an address check is part of the card price was
  not found.
- **PostGrid.** Its own pages were described as showing a pay-as-you-go price and several monthly plans, with
  different prices per card on different pages. Its support pages were described as saying to ask its sales team for
  the price of ordering by API, which is how the site would order. Its address check was described as a separate
  product.
- **Click2Mail.** Its product sheet was described as listing a 4.25 by 6 inch postcard, not 4 by 6. Check that this
  is the card meant. It was described as pay-as-you-go with no monthly fee and no minimum, by a third-party site, not
  by Click2Mail. Its own page for developers was described as offering mail tracking and automatic address clean-up.
  Two third-party sites gave two different prices.
- **Stannp.** Two of its own United States pages were described as showing different prices for the 4x6 card at the
  lowest volume, and a third page (`https://www.stannp.com/us/direct-mail-pricing`) as last updated in October 2024. Its notes for developers were described as saying First-Class is included for 4x6, and as returning
  a status and a cost for each card. An older page was described as charging extra for an address the Postal Service
  does not match. Nothing was found on a minimum deposit.

## To finish this page

Either way takes a few minutes.

1. **Read the four pricing pages yourself** and write the numbers into the table with the date. For each vendor,
   look for: the price of one 4x6 First-Class postcard on the plan with no monthly fee; any monthly fee or minimum
   spend; whether checking the address costs extra; the stated delivery time; whether it reports "mailed" and
   "returned"; how long it keeps addresses and how to have them deleted.
2. **Or allow these sites in this machine's network settings**, and ask for this page to be completed:
   `www.lob.com`, `help.lob.com`, `www.postgrid.com`, `click2mail.com`, `www.stannp.com`. The numbers will then be
   read from the pages and written here with the date.

The firmest number is a written quote from the vendor, or the price shown inside a signed-up account.

## What your $100 cap buys

Cards per month = the cap, divided by the real cost of one card, rounded down. The site works this out from the
number you set, and refuses the card that would cross the cap. It does not guess a price: with no price set, no
vendor is used.

Two things to decide once the prices are known:

- **A plan with a monthly fee.** The cap in the code counts cards only. A monthly fee would be on top of it. If you
  want the fee inside the $100, say so and the cap will be lowered by the fee.
- **A card that is paid for but never arrives.** The site counts a card as spent when the vendor accepts it. A lost
  or returned card is still paid for. A reader can ask for one more after 14 days, up to two cards per address in a
  year.

## What is built, and what turning it on would take

Built now, behind `MAIL_VERIFICATION_ENABLED` (off):

- The code: 6 characters, no look-alike characters, kept only as a scrambled fingerprint, good for 30 days, one
  account per code.
- The limits: two postcards per address in a year; the monthly cap, `POSTCARD_MONTHLY_CAP_USD`, 100 unless you raise
  it; only for an account with a matched home address.
- The reader's step on the Account page, and a one-line offer after the third counted answer.
- A rehearsal sender that mails nothing and costs nothing. In a rehearsal only the editor sees the postcard step, and
  no account becomes mail-verified.
- Counts for the editor on Editor → Flagged answers.

Not built, on purpose:

- The code that talks to a vendor. `lib/mail-verify/sender.ts` has a marked place for it (`vendorSender`). It refuses
  every card today.

To mail real cards, in this order:

1. You pick a vendor and confirm its real cost per card on its own page.
2. A developer writes the vendor code, and adds the vendor to the privacy page (`lib/trust.ts`). A test fails until
   the privacy page names the vendor.
3. In Vercel: `POSTCARD_VENDOR` (the vendor's name), `POSTCARD_API_KEY` (its key), `POSTCARD_PIECE_COST_USD` (the
   real cost of one card), and `MAIL_VERIFICATION_ENABLED=1`. With any of the first three missing, nothing is mailed.
4. One real card to your own address, to check the wording and how long it takes.

## The words on the card

A postcard can be read by anyone who handles it. So it carries only the site's name and the code:

> Your code from [the site's name]
> K7M 2QX
> Someone at this address asked [the site's name] to mail this code. To use it, sign in, open Account, and type it
> in by [date].
> If nobody here asked for it, you can throw this card away. The code works for one account only.

Addressed to "Current resident". Say if you want different words.
