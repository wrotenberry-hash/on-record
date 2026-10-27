# Operating context

How the founder works with this build. Read before any run; fold corrections
in here so nothing has to be re-explained. Last updated 2026-10-27.

## The founder

- Wilson (wrotenberry@gmail.com). Non-technical, usually on an iPad or phone.
  Attention is the scarce resource. Plain language, one phone screen per message.
- Never ask him to paste a key, token or secret into chat. Name the dashboard
  field it goes in.
- Tag every action for him: **Claude Code**, **Claude chat**, or **manual in a
  dashboard** (Vercel / OpenAI / Resend / registrar).
- Batch non-blocking questions to phase boundaries, at most three, one sentence
  each, each with a recommendation and the default taken if he does not reply.
  He has said twice that too many confirmations defeat the point. Make the call,
  log it in the dashboard's Assumptions panel, keep moving.
- Keep **coded / deployed / ran / verified** strictly separate in every report.

## Escalation list (ask, with options and a default, then keep working the rest)

Spending money · legal exposure · production data · schema changes beyond
additive nullable columns · anything an outside party sees · turning a flag on
in production · anything irreversible · any change to the review gates or to
what is visible to whom.

## Standing decisions

- Dedicated repo `wrotenberry-hash/on-record`; main deploys to production on
  Vercel. The editor is private and the public switch is off, so a deploy is
  not something an outside party sees.
- Public inventory withheld until 20 reviewed CHECKING records. Rejected
  representations are never public. Records show passages, not whole captures.
- No ratings or aggregate scores until the founder approves coverage,
  sufficiency and correction rules.
- Access-key sign-in; reviewer identity is the first `EDITOR_EMAILS` entry.
- Exception-only alerts by Resend; a continuing problem repeats every 72 h.
- The daily unit of work is one case **reviewed**, not published. A publishing
  quota would bend approvals.
- The daily emails ride the two existing scheduled runs. No new cron entries
  (Vercel free plan cap).
- OpenAI monthly limit is $20 unless Wilson raises it. Two runs a day costs
  about $37 a month, so intake stops mid-month at $20. Escalated 19 Oct;
  default if silent is to wait for the monthly reset.

## Status dashboard

https://claude.ai/artifact/BkdBcsZEgDYiW4q93cbMTm — republished every run,
never a new link. Weekly health report into the Claude session every Monday
9:05am Eastern.

## Open questions never answered (defaults taken)

- Plattsburgh quote: statement body or related-links box? Fix shipped either way.
- Delete the Cloudflare Hello World worker and the old ChatGPT Site. No urgency.
