// The first 60 seconds, as a brand-new trial reader on a phone (390 px wide, CPU slowed 4×).
//
//   node tests/e2e/flow.mjs --base http://localhost:3104 [--out <folder for screenshots>] [--invites 23,24,25,22]
//   node tests/e2e/flow.mjs --base http://localhost:3104 --only down     (server started with CENSUS_GEOCODER_BASE=http://127.0.0.1:9)
//
// Start the app first, in this folder:  PUBLIC_READ_ENABLED=false npx next dev -p 3104   (add --webpack in a git worktree).
// The script signs in by redeeming local invite links (made from the key in .env.local, which is never printed) and
// first clears those invites' saved place, issues and answers in the LOCAL database file, so every run starts new.
// It refuses to touch anything but the local file database.
//
// For each run it records the number of taps (typing is not a tap) and the seconds from the landing page's first
// paint to (a) the legislators being visible and (b) the first answer being saved. Target: both within 60 seconds for
// a person, at most 3 taps to the first saved answer. It also checks: no sideways scrolling, tap targets of at least
// 44 px on the flow's own controls, plain messages that keep what was typed, and the aggregate funnel counts.
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const BASE = arg("base", "http://localhost:3104").replace(/\/$/, ""), OUT = resolve(arg("out", join(tmpdir(), "flow-e2e"))), ONLY = arg("only", "");
const INVITES = arg("invites", "23,24,25,22").split(",").map(Number);
const ROOT = process.cwd(), DB_FILE = resolve(ROOT, ".data/on-record.db");
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const TYPE_DELAY = 110; // ms per key: a person typing on a phone
mkdirSync(OUT, { recursive: true });

let playwright;
try { playwright = createRequire("/opt/node-tools/node_modules/")("playwright"); } catch { playwright = (await import("playwright")).default; }

/* ------------------------------------------------------------ local sign-in --- */
const env = Object.fromEntries(readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
if (env.ON_RECORD_DATABASE_URL || env.TURSO_DATABASE_URL || !existsSync(DB_FILE)) throw new Error("This script only runs against the local file database (.data/on-record.db).");
const { createClient } = createRequire(resolve(ROOT, "package.json"))("@libsql/client");
const db = createClient({ url: `file:${DB_FILE}` });
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const token = id => `${id}.${createHmac("sha256", env.EDITOR_ACCESS_KEY).update(`on-record:trial-invite:v1:${id}`).digest("hex").slice(0, 32)}`; // lib/trial-token.ts

/** A fresh reader: the invite's saved place, issues, answers and visit history are cleared (local database only). Returns the invite link. */
async function freshInvite(number) {
  const inv = (await rows("select id from beta_invites where number = ? and revoked_at is null", [number]))[0];
  if (!inv) throw new Error(`No usable invite number ${number} in the local database.`);
  const user = (await rows("select id from app_users where external_key = ?", [`invite:${inv.id}`]))[0];
  if (user) for (const t of ["reader_locations", "reader_issues", "opinion_user_votes", "reader_unsure", "position_history", "counted_positions", "voice_votes", "voice_legacy_choices"]) await db.execute({ sql: `delete from ${t} where user_id = ?`, args: [user.id] });
  // A fresh reader has no earlier visits either. Without this the same four invites reach their third active day when
  // the suite runs on three different days, and the one-question feedback prompt (a second form) appears on the landing.
  await db.execute({ sql: "update beta_invites set active_days = 0, last_active_day = null, first_seen_at = null, last_seen_at = null where id = ?", args: [inv.id] });
  return `${BASE}/trial/${token(inv.id)}`;
}
const FUNNEL = ["flow_landing", "flow_zip", "flow_address", "flow_district", "flow_issues", "flow_first_answer", "first_answer_seconds", "onboarding_start", "onboarding_zip", "onboarding_done", "lookup_zip_failed", "lookup_address_failed"];
async function funnel() {
  const day = new Date().toISOString().slice(0, 10), out = {};
  for (const r of await rows(`select name, dim, n from event_counts where day = ? and name in (${FUNNEL.map(() => "?").join(",")})`, [day, ...FUNNEL])) out[`${r.name}${r.dim ? `:${r.dim}` : ""}`] = Number(r.n);
  return out;
}

/* ------------------------------------------------------------------ helpers --- */
const browser = await playwright.chromium.launch();
async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: PHONE_UA });
  const page = await context.newPage();
  await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return { context, page };
}
const problems = [];
const check = (run, ok, what) => { if (!ok) problems.push(`${run}: ${what}`); return ok; };
async function shot(page, run, name) { const p = join(OUT, `${run}-${name}.png`); await page.screenshot({ path: p, fullPage: true, caret: "initial" }); return p; }

/** WCAG 2.1 A and AA (axe-core, when it is installed: it comes with eslint-config-next). Returns short violation lines. */
const AXE = [() => createRequire(resolve(ROOT, "package.json")).resolve("axe-core/axe.min.js"), () => { const store = resolve(ROOT, "node_modules/.pnpm");
  const d = readdirSync(store).filter(x => x.startsWith("axe-core@")).sort().reverse()[0]; return resolve(store, d, "node_modules/axe-core/axe.min.js"); }, () => "/opt/node-tools/node_modules/axe-core/axe.min.js"]
  .map(f => { try { return f(); } catch { return null; } }).find(p => p && existsSync(p));
async function axe(page, run, where) {
  if (!AXE) return "axe-core not found: not checked";
  await page.evaluate(readFileSync(AXE, "utf8"));
  const v = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] }).then(r => r.violations.map(x => `${x.id}: ${x.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`)));
  for (const line of v) check(run, false, `accessibility (${where}): ${line}`);
  return v.length ? v : "0 violations";
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** The flow's own buttons, inputs and links must be at least 44 px tall. */
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll(".place-form input:not([type=hidden]), .place-form button, .flow-stance button, .flow-choices button, .flow-issues summary, .flow-card a, .flow-bills a, .flow-finish a")]
  .filter(e => e.getClientRects().length).map(e => ({ text: (e.textContent || e.getAttribute("name") || "").trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter(x => x.h < 44));

/** Opens the invite link (which lands on the welcome screen, then the home page) and returns the wall-clock time of the landing page's first paint. */
async function arrive(page, number) {
  await page.goto(await freshInvite(number), { waitUntil: "load" });
  // A first visit opens the welcome screen; its main button leads to the home page's one form.
  if (new URL(page.url()).pathname === "/welcome") await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.locator(".place-form input[name=zip]").first().waitFor();
  const paint = await page.evaluate(() => new Promise(done => {
    const read = () => { const e = performance.getEntriesByName("first-contentful-paint")[0]; if (e) done(performance.timeOrigin + e.startTime); else setTimeout(read, 20); }; read(); }));
  return paint;
}
const seconds = (from, to = Date.now()) => Math.round((to - from) / 100) / 10;

/** One full run: type the place, tap, (choose a district), tap Support on the first bill. */
async function run(name, number, { zip, street, expectCards, chooseDistrict }) {
  const { context, page } = await phone(), shots = [];
  let taps = 0;
  const t0 = await arrive(page, number);
  const landing = { h1: await page.locator("h1").first().innerText(), forms: await page.locator("main form").count(), path: new URL(page.url()).pathname };
  check(name, landing.path === "/", `the invite should land on the home page, got ${landing.path}`);
  check(name, landing.forms === 1, `the landing should have one form, found ${landing.forms}`);
  const attrs = await page.evaluate(() => { const z = document.querySelector("input[name=zip]"), s = document.querySelector("input[name=street]");
    return { zip: [z.autocomplete, z.inputMode, !!z.labels?.length], street: [s.autocomplete, !!s.labels?.length], aboveFold: document.querySelector(".place-form button").getBoundingClientRect().bottom <= window.innerHeight }; });
  check(name, attrs.zip[0] === "postal-code" && attrs.zip[1] === "numeric" && attrs.zip[2] && attrs.street[0] === "street-address" && attrs.street[1], `autofill, keyboard or labels wrong: ${JSON.stringify(attrs)}`);
  check(name, attrs.aboveFold, "the button is not on the first screen");
  check(name, (await sideways(page)) <= 0, "the landing scrolls sideways");
  check(name, (await smallTargets(page)).length === 0, `small tap targets on the landing: ${JSON.stringify(await smallTargets(page))}`);
  const a11y = { landing: await axe(page, name, "landing") };
  shots.push(await shot(page, name, "1-landing"));

  await page.locator("input[name=zip]").first().pressSequentially(zip, { delay: TYPE_DELAY });
  if (street) await page.locator("input[name=street]").first().pressSequentially(street, { delay: TYPE_DELAY });
  await page.locator(".place-form button[type=submit]").first().tap(); taps++;
  await page.locator(".flow-cards .flow-card").first().waitFor({ timeout: 60_000 });
  const legislatorsAt = seconds(t0), tapsToLegislators = taps;
  const lines = await page.locator(".flow-cards .flow-card .flow-line").allInnerTexts();
  shots.push(await shot(page, name, "2-legislators"));

  if (chooseDistrict) {
    const choices = await page.locator(".flow-choices button").allInnerTexts();
    check(name, choices.length > 1, `expected a "Which is your district?" chooser, found ${choices.length} choices`);
    check(name, (await page.getByText("Add your street address to pick it for you").count()) === 1, "the street-address hint under the chooser is missing");
    await page.locator(".flow-choices button").first().tap(); taps++;
    await page.locator(".flow-choices").waitFor({ state: "detached", timeout: 30_000 });
    shots.push(await shot(page, name, "3-district-chosen"));
  }
  const names = await page.locator(".flow-cards .flow-card:not(.flow-placeholder) .flow-name").allInnerTexts();
  check(name, names.length >= expectCards, `expected ${expectCards} legislators, found ${names.length}: ${names.join(", ")}`);
  check(name, (await sideways(page)) <= 0, "the results scroll sideways");
  check(name, (await smallTargets(page)).length === 0, `small tap targets in the results: ${JSON.stringify(await smallTargets(page))}`);

  const before = await page.evaluate(() => window.scrollY);
  const first = page.locator(".flow-bills > li").first();
  const bill = await first.locator(".flow-billname").innerText();
  await first.getByRole("button", { name: "Support", exact: true }).tap(); taps++;
  await first.locator(".flow-saved", { hasText: "Saved: Support" }).waitFor({ timeout: 30_000 });
  const answerAt = seconds(t0);
  check(name, new URL(page.url()).pathname === "/start", "answering left the page");
  check(name, (await first.getByRole("button", { name: "Support", exact: true }).getAttribute("aria-pressed")) === "true", "Support is not shown as chosen");
  await page.locator(".flow-compare > li").first().waitFor({ timeout: 30_000 });
  const compare = await page.locator("#district").innerText();
  check(name, /25 verified people/.test(compare), "the district block does not give the 25-person threshold message");
  check(name, !/\d+ support · \d+ oppose/.test(compare) || /In [A-Z]{2}-/.test(compare), "a total is shown without a district");
  const after = await page.evaluate(() => window.scrollY);
  check(name, Math.abs(after - before) < 300 || after > 0, "the page jumped to the top after the answer");
  shots.push(await shot(page, name, "4-answer-saved"));
  a11y.results = await axe(page, name, "results");
  check(name, taps <= 3, `${taps} taps to the first saved answer (target: at most 3)`);
  check(name, legislatorsAt <= 60 && answerAt <= 60, `too slow: legislators ${legislatorsAt}s, answer ${answerAt}s`);
  // A returning reader: the home page is now the personal home, with the legislators and what is coming up near the top.
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  check(name, (await page.locator(".personal .flow-cards .flow-card").count()) >= expectCards && (await page.locator(".personal #coming-up").count()) === 1 && (await page.locator(".flow-landing").count()) === 0,
    "the home page of a returning reader should show their legislators and what is coming up, not the landing form");
  check(name, (await page.locator("#coming-up .flow-saved", { hasText: "Your answer: Support" }).count()) === 1, "the home page does not show the answer just saved");
  check(name, (await sideways(page)) <= 0, "the home page scrolls sideways");
  a11y.home = await axe(page, name, "home");
  shots.push(await shot(page, name, "5-home-returning"));
  await context.close();
  return { run: name, accessibility: a11y, typed: street ? `${zip} + "${street}"` : zip, legislators: names, firstLines: lines.slice(0, 5), tapsToLegislators, tapsToFirstAnswer: taps, secondsToLegislators: legislatorsAt, secondsToFirstAnswer: answerAt, answered: bill.slice(0, 90), screenshots: shots };
}

/**
 * Picking an issue re-sorts the coming votes in place. Local test data: one scheduled bill with a bill record is filed
 * under "Health care" for the length of the run (and unfiled afterwards) so there is something to bring to the top.
 */
async function issues(number) {
  const name = "issues", week = (() => { const d = new Date(), m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))); return m.toISOString().slice(0, 10).replace(/-/g, ""); })();
  const target = (await rows("select f.bill_id as id from official_floor_schedule f join official_bills b on b.id = f.bill_id where f.week_of >= ? and not exists (select 1 from bill_categories c where c.bill_id = b.id) order by b.number desc limit 1", [week]))[0];
  if (!target) return { run: name, skipped: "no scheduled bill with a bill record and no issue in the local database" };
  await db.execute({ sql: "insert or ignore into bill_categories (bill_id, category_slug, method, confidence, created_at) values (?, 'health-care', 'editor', 1, ?)", args: [target.id, Date.now()] });
  const { context, page } = await phone();
  try {
    await arrive(page, number);
    await page.locator("input[name=zip]").first().fill("78701");
    await page.locator(".place-form button[type=submit]").first().tap();
    await page.locator(".flow-bills > li").first().waitFor({ timeout: 60_000 });
    const before = await page.locator(".flow-bills > li .flow-billname").allInnerTexts();
    await page.locator(".flow-issues > summary").tap();
    await page.locator(".flow-issues .chip-check", { hasText: "Health care" }).tap();
    await page.locator(".flow-bills > li .flow-where", { hasText: "on your issues: Health care" }).first().waitFor({ timeout: 30_000 });
    const after = await page.locator(".flow-bills > li .flow-billname").allInnerTexts(), firstWhere = await page.locator(".flow-bills > li .flow-where").first().innerText();
    check(name, /on your issues: Health care/.test(firstWhere), `the bill on the chosen issue should be first, got "${firstWhere}"`);
    check(name, /Health care/.test(await page.locator(".flow-issues > summary").innerText()), "the chosen issue is not named in the picker");
    check(name, new URL(page.url()).pathname === "/start", "picking an issue left the page");
    const p = await shot(page, name, "resorted");
    return { run: name, firstBefore: before[0], firstAfter: after[0], firstLineAfter: firstWhere, screenshots: [p] };
  } finally {
    await context.close();
    await db.execute({ sql: "delete from bill_categories where bill_id = ? and category_slug = 'health-care' and method = 'editor'", args: [target.id] });
  }
}

/** Wrong ZIP, an address the Census cannot place: a plain message, and the typing stays. */
async function mistakes(number) {
  const { context, page } = await phone(), out = [], name = "mistakes";
  await arrive(page, number);
  const submit = async (zip, street) => {
    await page.locator("input[name=zip]").first().fill(zip); await page.locator("input[name=street]").first().fill(street);
    await page.locator(".place-form button[type=submit]").first().tap();
    await page.locator(".place-form [role=alert]").waitFor({ timeout: 40_000 });
    await page.waitForFunction(() => !document.querySelector(".place-form button[disabled]"));
    return { message: await page.locator(".place-form [role=alert]").innerText(), zipKept: await page.locator("input[name=zip]").first().inputValue(), streetKept: await page.locator("input[name=street]").first().inputValue(), path: new URL(page.url()).pathname };
  };
  for (const [label, zip, street] of [["no ZIP", "", ""], ["wrong ZIP", "00000", ""], ["letters", "787O1", ""], ["address not found", "78701", "99999 Nowhere Imaginary Rd"]]) {
    const r = await submit(zip, street);
    check(name, r.zipKept === zip && r.streetKept === street && r.path === "/", `${label}: the typing was not kept (${JSON.stringify(r)})`);
    out.push({ case: label, typed: [zip, street], ...r });
  }
  const shotPath = await shot(page, name, "address-not-found");
  await context.close();
  return { run: name, cases: out, screenshots: [shotPath] };
}

/** With the Census service unreachable (server started with CENSUS_GEOCODER_BASE pointing nowhere): a plain message, typing kept; ZIP alone still works. */
async function geocoderDown(number) {
  const { context, page } = await phone(), name = "geocoder-down";
  await arrive(page, number);
  await page.locator("input[name=zip]").first().fill("78701"); await page.locator("input[name=street]").first().fill("1100 Congress Ave");
  await page.locator(".place-form button[type=submit]").first().tap();
  await page.locator(".place-form [role=alert]").waitFor({ timeout: 60_000 });
  const r = { message: await page.locator(".place-form [role=alert]").innerText(), zipKept: await page.locator("input[name=zip]").first().inputValue(), streetKept: await page.locator("input[name=street]").first().inputValue() };
  check(name, /did not answer/.test(r.message) && r.zipKept === "78701" && r.streetKept === "1100 Congress Ave", `expected the "did not answer" message with the typing kept: ${JSON.stringify(r)}`);
  const shotPath = await shot(page, name, "message");
  await page.locator("input[name=street]").first().fill("");
  await page.locator(".place-form button[type=submit]").first().tap();
  await page.locator(".flow-cards .flow-card").first().waitFor({ timeout: 60_000 });
  await context.close();
  return { run: name, ...r, zipAloneStillWorks: true, screenshots: [shotPath] };
}

/* --------------------------------------------------------------------- runs --- */
const results = [], countsBefore = await funnel();
try {
  if (ONLY === "down") results.push(await geocoderDown(INVITES[3]));
  else {
    if (!ONLY || ONLY === "zip") results.push(await run("zip-one-district", INVITES[0], { zip: "78701", expectCards: 3 }));
    if (!ONLY || ONLY === "split") results.push(await run("zip-several-districts", INVITES[1], { zip: "78660", expectCards: 3, chooseDistrict: true }));
    if (!ONLY || ONLY === "address") results.push(await run("texas-address", INVITES[2], { zip: "78701", street: "1100 Congress Ave", expectCards: 5 }));
    if (!ONLY || ONLY === "mistakes") results.push(await mistakes(INVITES[3]));
    if (!ONLY || ONLY === "issues") results.push(await issues(INVITES[3]));
  }
} finally { await browser.close(); }
const countsAfter = await funnel(), counted = {};
for (const k of new Set([...Object.keys(countsBefore), ...Object.keys(countsAfter)])) { const d = (countsAfter[k] ?? 0) - (countsBefore[k] ?? 0); if (d) counted[k] = d; }
const report = { base: BASE, when: new Date().toISOString(), viewport: "390x844, CPU slowed 4x", results, funnelCountsAdded: counted, problems };
writeFileSync(join(OUT, ONLY ? `flow-report-${ONLY}.json` : "flow-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(problems.length ? 1 : 0);
