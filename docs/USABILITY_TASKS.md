# Usability tasks

Tasks a first-time reader should finish on a phone, with a target time. Each is
checked by a scripted run at iPhone size (Playwright, local stand-ins for the
outside services) and then by Wilson by hand on his own phone once the services
are live.

## Round E

| Task | Target | Scripted check (16 Nov) | By hand |
| --- | --- | --- | --- |
| Verify and cast your first counted vote | ≤ 90 s on a phone | 6 s scripted, from the signed-in Account page through phone, code, district and Support, with no sideways scrolling. Steps: type the mobile number, tick consent, tap "Text me a code", type the 6-digit code (iOS and Android offer it from the text), tap Confirm, (optional) street, city, state, ZIP with autofill, tap "Match my district", open a bill, tap Support. Estimated by hand: about 40 s for a real-person vote, 60–80 s with the district step. | Not yet: needs the Turnstile and Twilio keys (MANUAL). |

Notes
- "Counted" means accepted into the counted set. A new account's answers enter
  the totals 24 hours after the account was created; the bill page says from when.
- The email sign-in step comes before this task (it is the Round 3 account task).
