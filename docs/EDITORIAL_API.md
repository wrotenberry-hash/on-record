# Editorial intake and case API

`GET /api/editor/drafts` and `POST /api/editor/drafts` require a signed-in editor **and** an explicit editor allowlist. Identity comes from a Supabase Auth magic-link session read server-side from an HttpOnly cookie (`lib/auth.ts`); nothing from the request body or a client header is trusted. Set `EDITOR_USER_IDS` or `EDITOR_EMAILS` as comma-separated environment variables containing the authorized reviewer's Supabase user ID or email. An unset or empty allowlist fails closed (HTTP 403). Missing identity returns HTTP 401.

## POST

Accepts JSON:

```json
{
  "speakerName": "Example speaker",
  "sourceType": "official statement",
  "canonicalUrl": "https://example.org/statement",
  "publishedAt": "2026-09-25T10:00:00-05:00",
  "originalContent": "The full captured text of the communication.",
  "exactText": "The full captured text",
  "canonicalProposition": "A candidate factual proposition, subject to review.",
  "issue": "Example issue"
}
```

`publishedAt` and `issue` may be omitted or null. All other fields are required. The URL must use HTTPS. `exactText` must appear verbatim in `originalContent`; the first occurrence's offsets are stored. The request never fetches the URL. `originalContent` is the editor's manually supplied capture and is hashed with SHA-256. Intake provenance stores the authenticated user's ID and the capture time. Source authenticity remains for editorial review.

HTTP 201 returns `{ id, communicationId, captureId, representationId, propositionId, speakerId, status: "CANDIDATE" }`. The speaker is reused by normalized slug, or created if absent. Each intake creates a new communication, revision 1 capture, proposition, and candidate representation. It does **not** infer that its proposition is equivalent to an existing one. The D1 batch atomically writes those four objects. A possible new speaker record is created separately before that batch.

## GET

Returns `{ "drafts": [{ "id", "communicationId", "speakerName", "exactText", "canonicalProposition", "issue", "createdAt" }] }`, newest first, limited to 100 candidate representations. `id` is the representation ID. `createdAt` is Unix milliseconds.

Intake does not lock materiality, collect evidence, adjudicate, rate, approve, or publish anything. There are no update or delete routes for original captures. The server-side allowlist controls both reading and writing drafts. Configure at least one authorized user before expecting the editor UI to work. The subsequent case actions and their strict order are specified in [CHECKING_INSTRUMENT_CONTRACT.md](CHECKING_INSTRUMENT_CONTRACT.md).
