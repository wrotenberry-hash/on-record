import test from "node:test";
import assert from "node:assert/strict";
import { extractClaims, fetchSource, searchSide } from "../lib/automated-research.ts";

test("source capture rejects internal destinations and redirects", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "https://example.org/new" } });
  try {
    await assert.rejects(fetchSource("https://127.0.0.1/private"), /public HTTPS/);
    await assert.rejects(fetchSource("https://example.org/old"), /Redirected source/);
  } finally { globalThis.fetch = original; }
});

test("extraction refuses a quote missing from the source", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: "resp_extraction", status: "completed", output: [{ type: "message", content: [
    { type: "output_text", text: JSON.stringify({ speakerName: "Example Speaker", claims: [{ exactText: "Invented factual sentence", proposition: "A factual proposition", issue: "Policy", materiality: "M2", materialityRationale: "Material to a policy debate" }] }) },
  ] }] });
  try { await assert.rejects(extractClaims("test-key", "test-model", "A different original communication appears here."), /did not match/); }
  finally { globalThis.fetch = original; }
});

test("bilateral research requires an actual web search and public citation", async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.tool_choice, "required");
    call++;
    return Response.json({ id: `resp_${call}`, status: "completed", output: call === 1 ? [
      { type: "message", content: [{ type: "output_text", text: "Unsupported recollection" }] },
    ] : [
      { type: "web_search_call", action: { type: "search", query: "official statistical source" } },
      { type: "message", content: [{ type: "output_text", text: "The official series differs by date.",
        annotations: [{ type: "url_citation", url: "https://example.org/data", title: "Official series" }] }] },
    ] });
  };
  try {
    await assert.rejects(searchSide("test-key", "test-model", "Test proposition", "SUPPORTS", "2026-09-25"), /No supports web search/);
    const result = await searchSide("test-key", "test-model", "Test proposition", "CONTRADICTS", "2026-09-25");
    assert.equal(result.citations[0].url, "https://example.org/data");
    assert.match(result.strategy, /official statistical source/);
  } finally { globalThis.fetch = original; }
});

test("page furniture is stripped before the readable body is chosen", async () => {
  const { stripChrome } = await import("../lib/automated-research.ts");
  const html = `<html><body><nav><a href="/x">Other release about Plattsburgh</a></nav>
    <main><article><p>Statement body sentence one. Statement body sentence two.</p></article>
    <div class="related-posts"><p>Sidebar quote that must not be extracted.</p></div></main>
    <footer>Contact</footer></body></html>`;
  const out = stripChrome(html);
  assert.match(out, /Statement body sentence one/);
  assert.doesNotMatch(out, /Sidebar quote/);
  assert.doesNotMatch(out, /Other release/);
  assert.doesNotMatch(out, /Contact/);
});
