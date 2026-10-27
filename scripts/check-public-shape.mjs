// Public-surface leak check. Run against a server with PUBLIC_READ_ENABLED=1:
//   node scripts/check-public-shape.mjs http://localhost:3000
// Fails if any public response carries a key that belongs to the private
// editorial record (full capture, reviewer identity, machine drafts, notes).
const base = process.argv[2] ?? "http://localhost:3000";
const PRIVATE_KEYS = ["originalContent", "reviewerId", "reviewedContentHash", "researchDraft", "assessment", "scoringProposal", "notes", "context", "email", "decidedBy", "publishedBy", "citations", "missingRequirements", "contentHash", "retrievalMetadata", "transcript", "error"];
function walk(value, path, found) {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, found));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { if (PRIVATE_KEYS.includes(k)) found.push(`${path}.${k}`); walk(v, `${path}.${k}`, found); }
}
let failed = false;
for (const route of ["/api/records", "/api/representations"]) {
  const res = await fetch(base + route);
  const body = await res.json().catch(() => ({}));
  const found = []; if (res.ok) walk(body, route, found); // a closed route answers only with its refusal message
  const note = res.status === 403 ? "closed (403)" : `${res.status}, ${Array.isArray(body.records) ? body.records.length : Array.isArray(body.representations) ? body.representations.length : "?"} items`;
  if (found.length) { failed = true; console.log(`FAIL ${route}: ${note}; private keys present: ${[...new Set(found)].join(", ")}`); }
  else console.log(`ok   ${route}: ${note}; no private keys`);
  if (route === "/api/records" && res.ok) for (const r of body.records ?? []) {
    if (typeof r.source?.passage === "string" && r.source.passage.length > 1400) { failed = true; console.log(`FAIL passage longer than the 600-character window on each side: ${r.source.passage.length}`); }
  }
}
process.exit(failed ? 1 : 0);
