// Local development only: seeds one machine-captured case with a COMPLETE research
// draft into ./.data so the review flow can be exercised without OpenAI. Refuses to
// run against a hosted database.
if (process.env.ON_RECORD_DATABASE_URL || process.env.TURSO_DATABASE_URL) { console.error("seed-review-case: refusing to seed a hosted database"); process.exit(2); }
import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./.data/on-record.db" });
const now = Date.now();
const quote = "The program cut average wait times by 40 percent in 2025.";
const lead = Array.from({ length: 120 }, (_, i) => `lead${i}`).join(" "), tail = Array.from({ length: 120 }, (_, i) => `tail${i}`).join(" ");
const content = `Statement from the office. ${lead} ${quote} ${tail} End of statement.`;
const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))), b => b.toString(16).padStart(2, "0")).join("");
await c.batch([
  { sql: "INSERT INTO people (id, display_name, slug, created_at) VALUES (?,?,?,?)", args: ["p1", "Example Speaker", "example-speaker", now - 5000] },
  { sql: "INSERT INTO source_communications (id, speaker_id, source_type, canonical_url, published_at, created_at) VALUES (?,?,?,?,?,?)", args: ["c1", "p1", "discovered:Executive:written:current", "https://example.gov/statement", now - 90000, now - 5000] },
  { sql: "INSERT INTO source_captures (id, communication_id, revision, captured_at, capture_url, content_type, original_content, content_hash) VALUES (?,?,?,?,?,?,?,?)", args: ["cap1", "c1", 1, now - 5000, "https://example.gov/statement", "text/html", content, hash] },
  { sql: "INSERT INTO propositions (id, canonical_text, issue, created_at) VALUES (?,?,?,?)", args: ["pr1", "The program reduced average wait times by 40 percent during calendar 2025.", "Health", now - 4000] },
  { sql: "INSERT INTO representations (id, capture_id, proposition_id, exact_text, extracted_at, status, context) VALUES (?,?,?,?,?,?,?)", args: ["11111111-1111-4111-8111-111111111111", "cap1", "pr1", quote, now - 4000, "CANDIDATE", "AI-extracted. Suggested pre-research materiality M2: A quantified outcome claim about a public program. Reviewer must independently compare the source and lock materiality."] },
  { sql: "INSERT INTO machine_research_drafts (representation_id, status, support_strategy, supporting_summary, contrary_strategy, contrary_summary, citations, assessment, attempted_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)", args: ["11111111-1111-4111-8111-111111111111", "COMPLETE", "agency reports 2025 wait times", "An agency report cites a 38 percent reduction.", "audit wait times 2025 critique", "An oversight letter disputes the baseline year.", JSON.stringify([{ url: "https://example.gov/report-2025", title: "Agency annual report 2025", side: "SUPPORTS" }, { url: "https://example.org/oversight-letter", title: "Oversight letter on baseline", side: "CONTRADICTS" }]), JSON.stringify({ accuracyAnchor: "U", contextIntegrity: "85", authority: 18, sufficiency: 10, directness: 15, temporalFit: 12, explanation: "Reported figure is close to the claim but the baseline year is disputed; unresolved pending the underlying data." }), now - 3000, now - 2000] },
]);
console.log("seeded case 11111111-1111-4111-8111-111111111111");
