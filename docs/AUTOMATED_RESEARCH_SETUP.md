# On Record automated research setup

## Decision

Start with the OpenAI Responses API. Intake uses `gpt-5.4-mini` to extract exact claim candidates and suggest materiality. An authenticated editor opening starts one `gpt-5.5` private draft with required live searches for support and contradiction and a provisional assessment. It remains outside canonical evidence and scoring until a person compares the original, approves the representation and locks materiality. The server-side model names are configurable as `OPENAI_EXTRACT_MODEL` and `OPENAI_RESEARCH_MODEL`. Claude is a viable later comparison arm after a measured pilot.

The site does not use the ChatGPT subscription as an API credential. API billing is separate. Do not place an API key in source, client JavaScript, chat messages, or a public form.

## Account and secret

1. In the OpenAI API dashboard, create a dedicated **On Record pilot** project. Add a payment method or prepaid balance as needed.
2. Monitor usage and configure project budget alerts. For an enforced monthly ceiling, select **Enforce a hard limit** under the API project's Spend settings; alerts alone do not stop requests and enforcement can lag slightly. The app also reserves at most two private bilateral research attempts per UTC day by default, including editor-initiated drafts. An authenticated editor opening captures at most one current lead and starts at most one draft. Research may use multiple model calls and web searches.
3. Create a project-scoped secret API key with an expiration date. Store it in Vercel → Project → Settings → Environment Variables as `OPENAI_API_KEY` (production). The integration reads it only on the server.
4. Deploy. Run one complete real-source case. A configured key alone is not proof the research workflow works.

## First pilot acceptance check

Choose a short, publicly readable original statement with a precise factual claim. Capture it in the private checking UI, compare the source, approve the representation, lock materiality and run bilateral research. Confirm:

- Original readable text and SHA-256 capture are preserved. Extracted exact text is a verbatim substring. Unsupported or inaccessible sources stop with a clear error.
- Materiality is locked before either research search timestamp; M0 ends without a factual rating.
- Both support and contradiction calls contain actual `web_search_call` records and public clickable source URLs. Source links are leads, not verified quotations.
- An internal fixed-anchor Accuracy, Context Integrity and four-part Evidence Confidence proposal is saved. The public state remains CHECKING with no numerical score.
- The original and citations are inspected by a person before any review approval. Publication is a separate action; drafts and incomplete cases do not appear in public records.
- Response failures preserve any private case already created and surface it for investigation. Watch actual API usage and latency before raising the pilot's spend limit.

The submitted-URL intake processes at most three claims per source. Opening the authenticated private editorial workspace checks original House and Senate leadership indexes once per UTC day per lane, captures one current lead and runs one private bilateral draft. Exact source URLs are checked before capture; failures are logged and throttled. New representations appear in the public incoming-claims inventory with no verdict, while evidence and AI assessments remain private. Vercel Cron runs the unattended job twice a day once `CRON_SECRET` is set; see `UNATTENDED_INTAKE.md`. It does not autonomously discover social posts, handle video/audio transcription, or semantically deduplicate differently worded propositions. Those are separate product milestones.
