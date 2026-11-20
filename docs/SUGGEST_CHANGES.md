# Suggest changes

Residents back specific changes to a bill while it can still be changed. Owner's instruction of 20 Nov 2026 is kept
verbatim at the end of this file. This file is the plan (Phase 1). Nothing here is built.

## The short version

- Constituent Voice is built, so this feature has something to sit on. Counting is still switched off in production, and
  no legislator's office has signed in, so two of the three "moments" the owner describes cannot be true yet: "how many
  neighbors asked for the same thing" and "what went to their legislator".
- The official record is good at telling us **where a bill is** and **how its text changed between versions**. It is poor
  at telling us **which amendments are on the table in committee**, which is exactly when the window is widest.
- So the menu will lean on two of the owner's three sources, version differences (b) and the bill's own dials (c). Filed
  amendments (a) can be offered only on the floor, and only after their text is fetched.
- The quality bar ("zero unsourced options") is met by code, not by judgment: every option carries a word-for-word quote
  from the section it changes, and an option whose quote is not found in that section never reaches the editor's queue.

## 1. What is built underneath (Constituent Voice)

| Piece | Built? | State on the live site |
|---|---|---|
| Support / Oppose / Unsure on a bill | Yes | Invited readers and the editor can answer. Answers are saved, private. |
| Verification tiers (address-matched, mail-verified), kept apart in totals | Yes | Off (`VERIFICATION_ENABLED`). Nobody has been matched. Needs the owner's keys (O-155). |
| District matching; an answer counts only inside the bill's jurisdiction | Yes | Works; counting itself is off. |
| Totals only after answering, only from 25 per district | Yes | No totals shown while counting is off. |
| Legislator office dashboard, with CSV export | Yes | No office has signed in. Its weekly email is built but not wired, and switched off. |
| Setting accounts and answers aside for review (never deleted) | Yes | Nothing flagged. |
| Rate limits and a bot check before the first counted answer | Yes | The bot check needs a key. |
| **Threat screening of text a resident writes** | **No** | Does not exist. Today the site sends nothing to anyone, so nothing is screened. |
| **Delivery of anything from a resident to a legislator** | **No** | "Contact your legislators" hands the reader a message to send themselves. |
| Weekly email and notices when a bill moves | Yes | Notices show on the site. Email is held until the site has its own sending address. |

What this means for the feature:

1. **A fourth answer cannot be added to the existing answers table without rebuilding it.** The three answers are fixed in
   that table by a database rule, and changing an existing table is one of the owner's hard stops. The plan below stores
   "Support if changed" in new tables and touches no existing one. (Question 1.)
2. **A private note "to the person's own legislator" has no road to travel on.** The only thing an office can see is its
   dashboard, and none has signed in. The site also promises, in writing and in a test, that a reader's reason is shown
   to nobody else. A note is a different thing (the reader writes it *for* the legislator), but the promise text, the
   privacy page and that test all have to change with it, and the box must say exactly who will read it, the editor
   included.
3. **Threat screening has to be built**, not reused. Proposed: written rules first (threats, slurs, phone numbers and
   addresses), then the model provider's free moderation check, and a person (the editor) reads anything either one
   stops. A note is not shown to an office until it has passed. Sending a resident's note to the model provider must be
   named on the privacy page.
4. **About 25 places in the code list the three answers.** Each has to learn the fourth.

**Order proposed.** Phase 2 (stage, menu, approval queue) depends on none of the missing pieces and can start now.
Phase 3 can be built and tried by trial readers with counting off, the same way answers work today; its receipt will say
truthfully that counting has not started. Phase 4's legislator view is only real once verification is on and at least
one office has signed in; it can be built and tested on a test copy before then.

## 2. What the data really provides

Counts are from the live site on 20 Nov 2026.

### Federal (Congress)

| Needed | Have it? | Where it comes from | What is missing or unreliable |
|---|---|---|---|
| Stage | Yes, 11 stages | Congress.gov actions, read into a stage | No "hearing scheduled" or "out of committee" stage; both can be worked out from data already stored. |
| Committee assignment | Yes | Committee codes on the actions | Only the first "referred" and "reported" dates. No record of markups or hearings held. |
| Committee members | Yes: 230 committees, 3,895 memberships | A community-kept copy of the official rosters, re-read weekly | Not read from the official pages themselves. The House Clerk's and the Senate's own roster files both answered today and could be the check. |
| Hearing and markup dates | Stored: 3 upcoming | Congress.gov committee meetings | **The reader for these was written from the documentation and has never been checked against live data.** Senate meetings are all typed "Meeting", so a hearing cannot be told from a markup. Treat as unreliable until checked. |
| Floor amendments | Partly: 900 on file | Congress.gov | Number, a one-line description, latest action and outcome only. **No sponsor, no text, no link to its vote.** Many descriptions are procedural: H.Amdt. 274 to H.R. 2102 reads "an amendment in the nature of a substitute specified in section 4 of that resolution is considered adopted". An option cannot be written from that. The text is a separate fetch; that fetch has not been tried. |
| Committee (markup) amendments | **No** | None | **There is no structured official record of them.** House committees post markup papers as PDF files, meeting by meeting. Senate committees each do it their own way, or not at all. |
| Successive versions | The list, with links: 735 | Congress.gov | The text is not kept. The newest two versions are compared, by section number only (added, removed, changed). |
| Sections of the text | Worked out when needed, not kept | The Government Publishing Office's plain-text page | Top-level sections only: no subsections. Only the first 40,000 characters are read. **The official page has no anchors, so "link to the exact section" means showing the section on our own page, quoted word for word, with a link to the official file.** |
| Which bills | 607 | Bills with a recorded vote, the 100 most recently changed, and this week's floor | **Almost all have already had their first vote.** Of the 251 read in depth, 24 are in committee and 2 are newly introduced; 172 have passed one chamber. Bills quietly in committee, where the window is widest, are mostly not held. |

### Texas

| Needed | Have it? | Where it comes from | What is missing or unreliable |
|---|---|---|---|
| Stage | Yes, 8 stages | Open States | No "hearing scheduled", "out of committee" or "in the other chamber". |
| Committee assignment | Partly | The words after "Referred to" in an action | Free text, not tied to a committee on file. |
| Committee members | 60 committees, 590 memberships | Open States | **These are the 2025 committees.** The 2027 committees are expected to be named after the session opens on 12 Jan 2027. The stored list carries no session label and will be overwritten. |
| Hearing dates | Upcoming only | Open States | None posted. The Legislature's own page said today: "No meetings have been scheduled." Its hearing notices are not read. |
| Amendments | **No** | Nothing | The Legislature does publish floor amendments bill by bill (House Bill 2 of 2025 lists 27). The site does not read them. A committee's rewrite shows up only as a new version. |
| Successive versions | The list, one link each | Open States | Text is read only while a summary is written. **No comparison between versions for Texas.** |
| Sections | Worked out when needed | The Legislature's HTML text | Added and struck words are marked, which will help. Not kept. |
| Which bills | 1,654 filed for 2027; 692 from 2025's second called session | Open States, 200 requests a day | **No bill filed for 2027 has a committee yet.** Until about February 2027 the only truthful thing to say on a Texas bill is that the window has not opened. Texas summaries have never been run. |

### What this adds up to

- **Source (b), differences between versions, is the strongest.** It is official, it is text, and it can be checked word
  for word. It needs the text of each version kept, section by section, and a comparison inside sections, not just of
  section numbers.
- **Source (c), the bill's own dials, is next.** Numbers, dates, thresholds and "who is covered" are in the text. Code
  can find them; the model only words them; code checks the quoted number is really in the section.
- **Source (a), filed amendments, is the weakest, and weakest exactly when it matters.** In committee there is nothing
  to read. On the floor there is a list, but the window is often hours long, and many of the House bills the site holds
  passed under a procedure (suspension of the rules) that allows no floor amendments at all. Offer it only where the text has been fetched and read.
- **The window.** For most bills the site holds today, the honest answer is "the House has finished with this; the
  Senate could still change it, and has not scheduled it". The feature must say that and not dress it up.

## 3. Official public comment channels

Linked only where confirmed from an official page on 20 Nov 2026.

| Chamber | Channel | Evidence |
|---|---|---|
| **Texas House** | **Yes.** Texas residents may send comments online on items posted for a hearing, until that hearing is adjourned. One address per committee. | The House Public Education Committee's official notice for 8 Apr 2025 (on the Legislature's site) says: "Texas residents who wish to electronically submit comments related to agenda items on this notice without testifying in person can do so until the hearing is adjourned by visiting: https://comments.house.texas.gov/home?c=c400". The Legislature also posts "House Public Comments (PDF)" on a bill's text page. The comment site itself could not be opened from the build machine; link to it from a hearing notice only. |
| **Texas Senate** | **None online found.** In person, with paper copies. | The Senate State Affairs notice for 7 Apr 2025 says: "Public testimony will be limited to 2 minutes. If submitting written testimony, please provide 25 copies to the committee clerk with your name and the bill number on each copy." No link. |
| **U.S. Senate** | **None chamber-wide.** | The Senate's contact page sends "questions and comments regarding public policy issues, legislation" to a person's own senators, and gives committees a postal address only. No link. |
| **U.S. House** | **Not confirmed.** | house.gov could not be opened from the build machine. No House-wide channel is known. Some committees take written statements for a hearing record, one committee at a time; none is confirmed, so none is linked. |

Consequence: outside the Texas House, the truthful sentence is "there is no official place to comment on this bill; your
own legislators are the route".

## 4. Data model

New tables only. No existing table is changed. One migration per phase, each needing the owner's yes.

**Phase 2**

- `bill_text_sections`: one row per section of each version of a bill (federal or Texas): the version, the section
  number and heading, its full text, and the link to the official file. This is what an option quotes and what the
  "exact section" link opens.
- `change_menus`: one per bill and text version: draft, waiting for the editor, live, or closed; what it cost.
- `change_options`: one row per option: which menu; its source (filed amendment, version difference, or dial) and the
  reference to that source; the section; **the word-for-word quote**; the direction (higher, lower, keep as written,
  remove; or adopt, do not adopt); the one-sentence wording; the pair it belongs to, so both directions always travel
  together; the automatic checks it passed; the editor's decision.
- The stage and "can it still be changed" line are worked out from data already stored. No table.

**Phase 3**

- `change_answers`: a reader's "Support if changed" on a bill, with the same counting fields as an ordinary answer. A
  reader has either an ordinary answer or this one on a bill, never both.
- `change_choices`: the options that reader tapped.
- `change_totals`: counts per bill, per place (nation, state, district), per verification tier, per option, and of the
  fourth answer itself. Shown under the existing rules: after answering, from 25.
- `change_notes`: the optional private note: the section, up to 500 characters, whose office it is for, and where it
  stands in screening (waiting, passed, held for the editor, refused).

**Phase 4**

- `change_outcomes`: for an option, what happened (made it in, partly, did not, the bill died), the new version or
  adopted amendment that shows it, the proposed match, and the editor's confirmation.
- `change_notices`: one per reader and option once an outcome is confirmed; feeds the weekly email, not a message per
  event.

Every new per-reader table is added to account deletion and to the privacy page's list of what is stored, by hand, with
a test.

**The check that carries the quality bar.** Before an option can reach the editor:

1. Its quote must appear, word for word, in the stored text of the section it cites. (Code. No model.)
2. A dial option's number, date or threshold must be inside that quote. (Code.)
3. A higher/lower option must have its opposite in the same pair; "keep as written" and "remove" are always offered. (Code.)
4. An amendment option must cite an amendment on the official list whose text was fetched. (Code.)
5. Its sentence passes the tone rules and the average-reader test already used for summaries. (Existing checks.)

The editor's queue shows each option beside its quoted source text. On the 10-bill test set, every option is also read
by hand against the official file, and the error rate reported.

## The owner's go-ahead for Phase 2 and three conditions (20 Nov 2026, verbatim)

"Go on Phase 2. Yes to all three questions: new tables only, $5 a month for menus, and load bills still in committee for
the five samples.

Three conditions:
1. Honest receipt. Until counting is on and delivery exists, every screen says the choice is "recorded" and never "sent
to your legislator". No neighbor counts are shown or implied.
2. Check the hearing-date reader against live data before the "can it still be changed" line goes on any bill page. If a
hearing date can't be confirmed, the page says the date isn't known.
3. Nothing in Phase 3 stores a private note until threat screening of text is built. Put that first in the Phase 3 plan.

Do not let this delay the trial."

How each is kept:

1. **Honest receipt.** A test fails the build if any screen of this feature says a choice is sent to a legislator, or
   mentions neighbors, while counting is off. The word is "recorded".
2. **Hearing dates.** Checked on 20 Nov against live records. Dates and times are right (a House hearing the official
   record gives as 17:30 UTC is 12:30 p.m. Eastern on the House's own calendar). One gap found: a live hearing on four
   bills carried no list of bills, only their numbers in its title; the reader now takes bill numbers from the title
   too. A date is printed only when the chamber's own calendar (the House committee calendar, or the Senate's hearing
   schedule) shows the same meeting at the same minute, checked in the last 36 hours. Otherwise the page says the date
   isn't known. Texas hearing dates are never printed in this block: that reader has not been checked against the
   Legislature's own notices.
3. **Private notes.** See the Phase 3 plan below: screening is step one, and no table that could hold a note is
   created before it passes its tests.

## Phase 3 plan (not started; in this order)

1. **Threat screening of text, first.** Built and tested before any table or box that could hold a note exists.
   - Written rules that need no outside service: threats and calls to harm, slurs, and personal details that should
     not travel (phone numbers, street addresses, email addresses, identity numbers).
   - A second check by the model provider's moderation service, if the owner agrees that a note's text may be sent
     there; the privacy page names it before the first note is taken.
   - Anything either check stops goes to the editor and nowhere else. Nothing is delivered on a pass alone until the
     owner has seen how the first real notes were sorted.
   - A fixed test set of notes (plain requests, angry but lawful ones, threats, ones carrying a phone number) with the
     required answer for each; the error rate is reported before step 2 starts.
2. **The fourth answer, "Support if changed"**, in new tables, with the menu the editor approved in Phase 2. Counting
   follows the existing rules; with counting off, the receipt says "recorded", shows no counts, and says nothing is
   sent to anyone yet.
3. **Who sits on the committee and where the reader's own legislators stand**, said plainly, including "your
   legislator is not on this committee" and what a choice can still do.
4. **The private note**, only now: 500 characters, tied to a section, screened by step 1, with the box saying exactly
   who will read it (the editor, and that legislator's office only once it has signed in). The written promise on the
   privacy page, the list of what is stored, account deletion and their tests change in the same step.
5. **The receipt**, with every sentence under condition 1.
6. Phone tasks: pick a change, read the receipt. Accessibility on every new screen.

## 5. Cost

- Drafting one menu with the stronger writing model: about 15,000 tokens in and 2,500 out, **about 15 cents**; with one
  repair pass, up to 30 cents. The reader test adds 1 to 2 cents.
- Phase 2 as specified: 5 sample bills, about **$0.75 to $1.50**. The 10-bill test set, about **$1.50 to $3**.
- Phase 4 matching a new version against a menu: 2 to 5 cents a bill, on the cheaper model.
- Fetching and storing text, sections, rosters and hearing dates costs nothing: no model is involved.
- Proposed limit: **$5 a month for this feature**, counted separately, inside the existing $40 monthly limit ($11.94
  used in November; summaries have their own $25). Menus are drafted one bill at a time, for bills whose window is open
  and that a reader follows or that have a hearing posted. No bulk run without the owner's yes.

## 6. Questions for the owner (Phase 1)

1. Store "Support if changed" in new tables, leaving the existing answers table untouched? Recommended: yes. Default: yes.
2. Approve a separate $5 a month limit for drafting menus, about $1.50 of it for the five samples and up to $3 for the
   10-bill test? Recommended: yes. Default: nothing is spent until you say yes.
3. Should the five samples be bills that can still be changed, which means loading some bills in committee that the site
   does not hold yet? Recommended: yes. Default: yes.

## The owner's instruction (20 Nov 2026, verbatim)

FEATURE: "Suggest changes" — let constituents back specific changes to a bill while it can still be changed.

GOAL
People should feel, truthfully, that they can affect a bill. That feeling comes from three moments: (1) the window: knowing the bill is at a stage where changes happen, (2) the receipt: seeing exactly what went to their legislator and how many neighbors asked for the same thing, (3) the outcome: hearing honestly whether the change made it in. Never overpromise impact. Build to the same quality bar as the summaries.

WORK IN PHASES. Stop at the end of each phase and report. Ask at most three questions per phase, one sentence each, with your recommendation and a default.

PHASE 1: PLAN ONLY, NO BUILDING
1. Check whether Constituent Voice (Support / Oppose / Unsure, verification tiers, district matching, 25+ threshold, legislator dashboard, abuse quarantine) is built. This feature sits on top of it. If it is not built, say so and propose the order.
2. Report what our data sources actually provide, for federal bills and for Texas: bill stage, committee assignment, committee members, hearing dates, filed amendments (committee and floor), and successive bill versions. Say plainly where data is missing or unreliable. Do not paper over gaps.
3. Check whether each chamber has an official public comment channel for bills in committee, and link to it only where you have confirmed it exists.
4. Propose the data model and the per-bill AI cost. Stay inside the monthly spending limit and get approval before any bulk run.

PHASE 2: THE MENU AND THE APPROVAL QUEUE
Stage awareness: every bill page shows, in plain English, where the bill is (introduced, in committee, hearing scheduled, out of committee, floor, other chamber, final) and whether changes are still possible. When the window is closed, say so.

The menu of changes comes ONLY from these sources, and each option is labeled with its source:
a) Amendments actually filed, from the official record.
b) Differences between versions of the bill (House vs Senate, introduced vs committee version).
c) The bill's own dials: numbers, dates, thresholds, who is covered. For each, offer higher / lower / keep as written / remove, always in both directions.

Rules for the menu:
- We never invent policy. Every option cites the exact section of bill text it changes and links to it.
- Neutral wording, one sentence, passes the average-reader test already used for summaries.
- AI drafts the menu; nothing goes live until the editor approves it in a queue that shows the option beside its source text.
- Deliver 5 sample bills with drafted menus for review at the end of this phase.

PHASE 3: ANSWERING, PRIVATE NOTES, RECEIPT
- Add a third answer, "Support if changed", alongside Support / Oppose / Unsure. Picking it opens the menu; the person taps the changes they want.
- Own idea: an optional private note (500 characters) tied to a specific section. It goes only to the person's own legislator, is never shown publicly, and passes through the existing threat screening and abuse quarantine. Similar notes are grouped for the editor, who can promote one to the menu only if it maps to a specific section and is approved.
- Counting follows the existing rules: one person, one district, verification tiers kept separate, totals shown only after the person answers and only at 25+ per district. Aggregates only. No comment threads.
- Jurisdiction: a person's choices go to their own legislators. Show who sits on the committee and the hearing date. If their legislator is not on the committee, say so honestly and explain what their input can still do.
- Receipt: after answering, show what was recorded, who it goes to, and how many in their district chose the same change (when above the threshold).

PHASE 4: LEGISLATOR VIEW AND OUTCOME LOOP
- Legislator dashboard: per bill, the requested changes ranked by count for their district, split by verification tier, with the bill section each refers to. Exportable.
- Outcome loop: when a new version or adopted amendment arrives, propose matches to menu options. The editor confirms each match before anyone is notified. Then tell everyone who chose that option what happened: made it in, partly, did not, or the bill died. Short weekly email, not one message per event.

QUALITY CHECKS BEFORE ANY PHASE IS CALLED DONE
- On a test set of 10 bills, verify every menu option against the source text and report the error rate. A wrong option misrepresents constituents to their legislator, so zero unsourced options is the bar.
- Phone tests and the usability task set extended to cover: find the window, pick a change, read the receipt.
- All new pages pass accessibility.

STANDING RULES
Start with the federal bills already loaded; design so Texas works without rework. No secrets in chat. No automatic status emails; report when I type "status". Flag anything that needs me to act in a dashboard.
