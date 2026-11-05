---
description: Recommend next actions as multiple choice, then execute them
---
Run this loop:

1. READ STATUS.md at the repo root. If it's missing, create it first (see the sections below). Use its Goal and Launch Target to decide what matters most.

2. VERIFY before recapping: run the build, tests, and lint (whatever exists). Note anything failing or anything you couldn't check. Never say something is "done" unless it passed.

3. RECAP in 2 lines max: what got done, what failed or is unverified.

4. ASK me with the AskUserQuestion tool (tappable multiple choice). Don't put the list in a text reply.
   - Question 1 (multiSelect: true): "Which should I do next?" Give up to 4 options in priority order, with your top pick first and labeled "(Recommended)". Labels are 5 words max. Descriptions are one line: why it matters. Start the description with [Opus] if the action needs the expensive model, and with ⚠️ if it's irreversible.
   - At least one option must move toward launch or something users will see, not only cleanup.
   - Questions 2–4 (optional, single select): only for decisions you truly need from me. Put your recommendation first.

5. EXECUTE what I picked, in dependency order, without checking in again.
   - Make one git commit per completed action, with a plain-English message, and push.
   - Use the cheap model for routine work. Use the expensive model only for [Opus]-tagged items.
   - Stop and ask only for escalation items: schema/data-model changes, auth/payments/security, anything ⚠️ that turns out different than described, or a bug that survived 2 fix attempts.
   - For dashboard steps I must do myself (Vercel, Supabase, etc.), add a one-line instruction to STATUS.md under "Waiting on Wilson," tell me in one line, and keep working on everything else.

6. UPDATE STATUS.md: move finished items to Done and record any decisions I made.

7. REPEAT from step 2 until I say stop.

STATUS.md sections: Goal | Launch Target | Done | In Progress | Blocked | Decisions Made | Waiting on Wilson
