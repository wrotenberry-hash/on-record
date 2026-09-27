# The review flow (2026-09-27)

The editor's case screen is four cards, one per gate, mostly taps. Every card
posts to the same server gates as before; nothing about the methodology moved,
only the amount of typing. `lib/…/[action]/route.ts` and the database triggers
are unchanged.

| Card | What the reviewer does | What is recorded |
| --- | --- | --- |
| 1. Check the source | Taps "Open the original", pastes the one sentence that contains the quote. The app refuses a paste that does not contain the exact text. | A `source_authentications` attestation with method `original-page`, the reviewer id, the capture digest, and a note that the app verified the pasted sentence. |
| 2. Judge it | Taps "factual claim, quoted correctly" or "Reject it" (reason prefilled, editable). Taps a materiality tier; the machine's suggestion is shown and must be tapped to accept; rationale prefilled from it, editable. One button approves and locks. If a machine draft exists it is brought in automatically. | `representations.status`, a `materiality_decisions` lock, then the draft promotion (searches, leads, proposal). |
| 3. Evidence | Opens each lead, ticks the ones that hold. "What remains unresolved" is prefilled from the machine's assessment, editable. Optionally records an own assessment (explicit expander). One button. | `adjudications` (CHECKING) with the ticked leads as considered evidence; optionally a new `scoring_proposals` revision. |
| 4. Finish | Approve / needs changes / reject, one note, one attestation tick, one button. Then "Publish as CHECKING" or leave private. | `reviews`, then `publications`. |

A rejected or M0 case shows a closed card. A published case shows when and a
link to the public record.

Verified in a headless browser against a seeded case
(`scripts/seed-review-case.mjs`, local database only): all four cards in
order, a non-matching paste refused, the machine suggestion accepted with one
tap, one of two leads kept, the case published, and `/api/records` still 403
with public reading off.

Time per case: a few minutes, dominated by reading the original and the leads,
which is the part that must stay human.
