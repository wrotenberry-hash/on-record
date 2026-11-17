import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * The product name is one config value (lib/brand.ts, NEXT_PUBLIC_BRAND_NAME). Two proofs:
 *  (a) the config and the pure modules that word emails, titles and cards follow the name;
 *  (b) no page, component, library file or static file spells the name out any more.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Loads the modules in a fresh process, because lib/brand.ts reads the name once, when it is first loaded. */
function loadWith(name) {
  const env = { ...process.env };
  delete env.NEXT_PUBLIC_BRAND_NAME;
  if (name !== undefined) env.NEXT_PUBLIC_BRAND_NAME = name;
  const script = `
    const b = await import("./lib/brand.ts"), seo = await import("./lib/seo.ts"), mon = await import("./lib/monitoring.ts");
    const digest = await import("./lib/digest-format.ts"), fb = await import("./lib/feedback-rules.ts"), report = await import("./lib/analysis/report-format.ts");
    const access = await import("./lib/public-access.ts"), cards = await import("./lib/card-content.ts");
    const vote = { date: "Nov 12", kindLabel: "Passage", voteText: "Voted yes on passing it", billLabel: "S. 1", billTitle: "A bill", headline: null, sourceUrl: "https://www.senate.gov/v.xml", billUrl: "https://site.test/bills/119-s-1" };
    const cardVote = { billLabel: "S. 1", billTitle: "A bill", headline: null, voteText: "Voted yes on passing it", kind: "passage", kindLabel: "Passage", votedAt: 0, sourceUrl: "https://www.senate.gov/v.xml" };
    console.log(JSON.stringify({
      BRAND: b.BRAND, title: b.brandTitle("Bills"), menu: b.recordSectionLabel("Politicians"),
      siteName: seo.SITE_NAME, pageTitle: seo.pageTitle("John Cornyn: votes"), preview: seo.previewMeta("https://example.test", "/x", "T", "D", "/i.png").openGraph.siteName,
      alert: mon.formatAlertEmail({ kind: "TEST", subject: "test alert", detail: "d" }, {}, "https://example.test", 0),
      digest: digest.formatDigest([{ name: "Sen. A", seat: "Senator", votes: [vote] }], { site: "https://site.test", unsubscribe: "https://site.test/u" }),
      report: report.formatSummariesEmail([], "https://example.test").subject,
      card: cards.agreementCard({ name: "A", seat: "B" }, "Health care", 1, 0, [cardVote]),
      question: fb.FEEDBACK_QUESTION, closed: access.PUBLIC_READ_DISABLED_MESSAGE,
    }));`;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: ROOT, env, encoding: "utf8" }));
}

test("set to On Record, the product looks exactly as it did before the rename", () => {
  const d = loadWith("On Record");
  assert.equal(d.BRAND.name, "On Record");
  assert.deepEqual(d.BRAND.wordmark, { lead: "ON", tail: "RECORD" });
  assert.equal(d.BRAND.nameUpper, "ON RECORD");
  assert.equal(d.BRAND.hasSeparateRecordName, false);
  assert.equal(d.BRAND.tagline, "Talk is cheap. The record isn't.");
  assert.equal(d.BRAND.taglineShort, "Talk is cheap.");
  assert.equal(d.BRAND.userAgentName, "OnRecord");
  assert.equal(d.BRAND.fileSlug, "on-record");
  assert.deepEqual(d.BRAND.icons, { small: "/icon-192.png", large: "/icon-512.png" });
  assert.equal(d.title, "Bills · On Record");
  assert.equal(d.menu, "Politicians", "the menu entry keeps its usual label");
  assert.equal(d.siteName, "On Record");
  assert.equal(d.pageTitle, "John Cornyn: votes · On Record");
  assert.equal(d.preview, "On Record");
  assert.equal(d.alert.subject, "[On Record] test alert");
  assert.match(d.alert.text, /^On Record alert: test alert\./);
  assert.equal(d.question, "What one thing would make On Record more useful to you?");
  assert.equal(d.digest.subject, "[On Record] How your members voted: 1 vote");
  assert.equal(d.report, "[On Record] 0 bill summaries are ready to read");
  assert.equal(d.card.footer, "Talk is cheap.");
  assert.match(d.card.note, /Not a rating by On Record\.$/);
});

test("with nothing set, or an empty or blank setting, the product is Constituent (owner, 17 Nov 2026)", () => {
  assert.equal(loadWith(undefined).BRAND.name, "Constituent");
  assert.equal(loadWith("").BRAND.name, "Constituent");
  assert.equal(loadWith("   ").BRAND.name, "Constituent");
});

test("the product is Constituent with nothing set; On Record is the voting-record section; the tagline stays", () => {
  const d = loadWith(undefined);
  assert.deepEqual(loadWith("Constituent"), d, "setting the name explicitly gives the same result");
  assert.equal(d.BRAND.name, "Constituent");
  assert.deepEqual(d.BRAND.wordmark, { lead: "", tail: "CONSTITUENT" }, "a one-word name is drawn whole");
  assert.equal(d.BRAND.nameUpper, "CONSTITUENT");
  assert.equal(d.BRAND.hasSeparateRecordName, true);
  assert.equal(d.BRAND.recordSection, "On Record");
  assert.equal(d.BRAND.tagline, "Talk is cheap. The record isn't.");
  assert.equal(d.BRAND.taglineShort, "Talk is cheap.");
  assert.equal(d.BRAND.userAgentName, "Constituent");
  assert.equal(d.BRAND.fileSlug, "constituent");
  assert.deepEqual(d.BRAND.icons, { small: "/icon-mark-192.png", large: "/icon-mark-512.png" }, "the icons with ON REC. drawn on them are not used under another name");
  assert.equal(d.title, "Bills · Constituent");
  assert.equal(d.menu, "On Record", "the menu entry for members' voting records takes the section name");
  assert.equal(d.siteName, "Constituent");
  assert.equal(d.pageTitle, "John Cornyn: votes · Constituent");
  assert.equal(d.preview, "Constituent");
  assert.equal(d.alert.subject, "[Constituent] test alert");
  assert.match(d.alert.text, /^Constituent alert: test alert\./);
  assert.equal(d.question, "What one thing would make Constituent more useful to you?");
  assert.match(d.closed, /^Constituent is in private review/);
  assert.equal(d.digest.subject, "[Constituent] How your members voted: 1 vote");
  assert.match(d.digest.text, /Constituent shows what officials did\. It does not grade them\.$/);
  assert.equal(d.report, "[Constituent] 0 bill summaries are ready to read");
  assert.equal(d.card.footer, "Talk is cheap.", "the card footer keeps the tagline");
  assert.match(d.card.note, /Not a rating by Constituent\.$/);
  // Nothing these modules produce still carries the old name, apart from the section name itself.
  const { recordSection, ...rest } = d.BRAND;
  assert.equal(recordSection, "On Record");
  assert.doesNotMatch(JSON.stringify({ ...d, BRAND: rest }).replace(/"menu":"On Record"/, ""), /On Record|ON RECORD|OnRecord/);
});

test("a name of several words keeps the two-part wordmark, and odd characters never reach a header or a file name", () => {
  const d = loadWith("  The Civic   Ledger ");
  assert.equal(d.BRAND.name, "The Civic   Ledger");
  assert.deepEqual(d.BRAND.wordmark, { lead: "THE CIVIC", tail: "LEDGER" });
  const odd = loadWith("Récord & Co.").BRAND;
  assert.match(odd.userAgentName, /^[A-Za-z0-9]+$/);
  assert.match(odd.fileSlug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

/* ---------- (b) no literal product name outside lib/brand.ts ---------- */

const SCAN_DIRS = ["app", "components", "lib", "public"];
const CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const BINARY = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".pdf", ".db"]);
/** The section name and the product name. The product name is matched as a capitalised whole word, so "constituents" in ordinary text is not a hit. */
const NAME = /On Record|ON RECORD|OnRecord|\bConstituent\b|\bCONSTITUENT\b/g;
/** The old split wordmark, `ON <span>RECORD</span>`: every top bar now uses components/brand/wordmark.tsx. */
const SPLIT_WORDMARK = /\bON\s*<span[^>]*>\s*RECORD\b/g;

/** The one file that is allowed to spell the name: it is where the name is defined. */
const CONFIG_FILE = "lib/brand.ts";

/**
 * Literals that stay, one line each, with the reason: `{ file, has, why }`; an entry matches a line of that file that
 * contains `has`. Empty since the rename of 17 Nov 2026: the owner's steps in lib/whats-next-plan.ts that name an
 * outside account or widget now take the name from the setting too.
 */
const ALLOW = [];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

/**
 * Every place the name is written in a file, comments left out. Code files are read with the TypeScript parser and
 * only what the program can show or send is checked (strings, template text, JSX text, identifiers), so a comment or
 * a doc block never counts. Other text files (CSS, SVG, JSON) are checked whole.
 */
function literalNames(file, text) {
  const hits = [];
  const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line;
  if (!CODE.has(extname(file))) {
    text.split("\n").forEach((line, i) => { if (line.match(NAME) || line.match(SPLIT_WORDMARK)) hits.push({ line: i + 1, text: line.trim() }); });
    return hits;
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(file) || file.endsWith(".js") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split("\n"), seen = new Set();
  const add = pos => { const n = lineOf(sf, pos); if (!seen.has(n)) { seen.add(n); hits.push({ line: n + 1, text: lines[n].trim() }); } };
  const visit = node => {
    let leaf = true;
    ts.forEachChild(node, child => { leaf = false; visit(child); });
    if (!leaf) {
      // The split wordmark spans several nodes: look for it in the source of each JSX element.
      if (ts.isJsxElement(node) || ts.isJsxFragment(node)) for (const m of node.getText(sf).matchAll(SPLIT_WORDMARK)) add(node.getStart(sf) + m.index);
      return;
    }
    const start = node.getStart(sf);
    for (const m of text.slice(start, node.end).matchAll(NAME)) add(start + m.index);
  };
  visit(sf);
  return hits;
}

test("the comment filter itself: names in strings, templates and JSX are found; names in comments are not", () => {
  const sample = [
    "/** On Record's doc comment. */",
    "// On Record in a line comment",
    'const a = "On Record";',
    "const b = `[On Record] ${a}`; /* ON RECORD trailing */",
    "const OnRecordThing = 1;",
    "export const C = () => <p>{/* On Record */}Read ON RECORD here <b>ON <span>RECORD</span></b></p>;",
    'const url = "https://on-record-wrotenberry.vercel.app"; // lower-case address: not the name',
  ].join("\n");
  assert.deepEqual(literalNames("sample.tsx", sample).map(h => h.line).sort((x, y) => x - y), [3, 4, 5, 6]);
  assert.deepEqual(literalNames("sample.tsx", 'const a = "Constituent";\nconst b = "what constituents say";\nconst c = "Constituents write in";').map(h => h.line), [1],
    "the product name is a hit; the ordinary word for the people a member represents is not");
  assert.deepEqual(literalNames("sample.css", "/* On Record */\n.a{}").map(h => h.line), [1], "files that are not code are checked whole");
});

test("no page, component, library or static file spells out the product name (only lib/brand.ts and the allow-list may)", () => {
  const found = [];
  let files = 0;
  for (const dir of SCAN_DIRS) for (const path of walk(join(ROOT, dir))) {
    const file = relative(ROOT, path).split("\\").join("/");
    if (file === CONFIG_FILE || BINARY.has(extname(file).toLowerCase())) continue;
    files++;
    for (const hit of literalNames(file, readFileSync(path, "utf8"))) {
      if (ALLOW.some(a => a.file === file && hit.text.includes(a.has))) continue;
      found.push(`${file}:${hit.line}: ${hit.text.slice(0, 160)}`);
    }
  }
  assert.ok(files > 200, `the scan should read the whole codebase (read ${files} files)`);
  assert.deepEqual(found, [], `The product name is typed out here. Use BRAND.name, brandTitle() or <Wordmark /> from lib/brand.ts instead:\n${found.join("\n")}`);
});

test("the static service worker names no product: the title and icon come from the server's answer", () => {
  const sw = readFileSync(join(ROOT, "public/sw.js"), "utf8");
  assert.match(sw, /fetch\("\/api\/push\/latest"/);
  assert.match(sw, /title: "New alert"/, "a neutral title if the request fails");
  assert.doesNotMatch(sw, /icon-192\.png/, "the icon with the name drawn on it is never the worker's own choice");
  const route = readFileSync(join(ROOT, "app/api/push/latest/route.ts"), "utf8");
  assert.match(route, /title: BRAND\.name/);
  assert.match(route, /icon: BRAND\.icons\.small/);
});
