import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, SOURCE_GROUPS, LABELS, SUMMARY_PARTS, WRITTEN_CHECKS, SUMMARY_STEPS, MEMBER_STATS_METHOD, READER_TOTALS, CLAIM_STEPS, PLEDGE_ALWAYS, PLEDGE_NEVER,
  COOKIES, PROCESSORS, STORED, LEGAL_REVIEW, FOUNDER_PLACEHOLDERS, DRAFT_BANNER } from "../lib/trust.ts";
import { MIN_SHOWN, ACCOUNT_MIN_AGE_MS, totalsLine, positionCounts } from "../lib/verify/rules.ts";
import { withPartyMajority } from "../lib/federal/member-stats-rules.ts";
import { positionLine } from "../lib/federal/vote-kinds.ts";
import { BANNED_WORDS, LIMITS, SAMPLE_EVERY, routeSummary } from "../lib/analysis/checker.ts";
import { HEADLINE_WORDS, NO_REASONS_FOUND, STRUCTURE_LIMITS } from "../lib/analysis/standard.ts";

/* The trust pages (How this works, Pledge, About, Privacy, Terms) render lib/trust.ts. These tests hold that file to the code. */

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");
function files(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(root, p)).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const hostsIn = text => [...text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map(m => m[1].toLowerCase());
const all = [...PLEDGE_ALWAYS, ...PLEDGE_NEVER];

/* ───────── Sources ───────── */

test("every source has a name, a publisher, a public home page, what is read and how often", () => {
  assert.equal(new Set(SOURCES.map(s => s.id)).size, SOURCES.length, "source ids are unique");
  for (const s of SOURCES) {
    assert.match(s.url, /^https:\/\/[a-z0-9.-]+\//, `${s.id} links its public home page`);
    for (const k of ["name", "publisher", "reads", "refreshed"]) assert.ok(s[k].trim().length > 5, `${s.id} has ${k}`);
    assert.ok(s.group in SOURCE_GROUPS, `${s.id} is in a known group`);
  }
});

test("the sources the owner named are all listed", () => {
  const ids = new Set(SOURCES.map(s => s.id));
  for (const id of ["congress-gov", "govinfo", "house-clerk", "senate", "congress-legislators", "congressional-record", "federal-register", "us-code", "cbo", "crs",
    "committee-reports", "open-states", "legiscan", "tlo", "census"]) assert.ok(ids.has(id), `${id} is listed`);
});

test("a source that is not a government site says so", () => {
  const open = SOURCES.filter(s => !s.government).map(s => s.id).sort();
  assert.deepEqual(open, ["congress-legislators", "legiscan", "open-states"]);
  for (const s of SOURCES.filter(x => !x.government)) assert.match(s.publisher, /Not a government site/, `${s.id} is labelled`);
  // Texas Legislature Online is the source of record and is linked, not copied.
  assert.match(SOURCES.find(s => s.id === "tlo").reads, /source of record/);
});

test("every outside host the code reads from is on the methodology or privacy page", () => {
  // The files that fetch official records or talk to an outside service. Explainers (primers) and gold examples only cite pages.
  const scanned = [...files("lib/federal"), ...files("lib/texas"), ...files("lib/verify"),
    ...files("lib/analysis").filter(f => !/primers\.ts$|gold-examples\.ts$/.test(f)), "lib/mailer.ts", "lib/automated-research.ts", "lib/social.ts", "lib/push.ts", "app/dashboard/page.tsx"];
  const known = new Set([...SOURCES.flatMap(s => s.hosts), ...PROCESSORS.flatMap(p => p.hosts)]);
  const own = /vercel\.app$|\.example$|^app\.local$/; // the site's own address and placeholders
  for (const f of scanned) for (const h of hostsIn(read(f))) {
    if (own.test(h)) continue;
    assert.ok(known.has(h), `${f} names ${h}, which is not in lib/trust.ts. Add it to SOURCES (an official source) or PROCESSORS (an outside service) so the How this works and Privacy pages list it.`);
  }
});

test("the refresh times on the page are the ones in the code", () => {
  const ingest = read("lib/federal/ingest.ts"), depth = read("lib/federal/depth.ts"), texas = read("lib/texas/ingest.ts"), cron = JSON.parse(read("vercel.json")).crons;
  assert.deepEqual(cron.map(c => c.schedule), ["0 13 * * *", "0 19 * * *"]);
  assert.match(SOURCE_GROUPS.congress.note, /twice a day, at 13:00 and 19:00 UTC/);
  assert.match(ingest, /const PER_RUN_CAP = 40;/);
  assert.match(SOURCES.find(s => s.id === "house-clerk").refreshed, /at most 40 each time/);
  assert.match(ingest, /LEGISLATORS_EVERY_MS = 20 \* 60 \* 60 \* 1000/);
  assert.match(SOURCES.find(s => s.id === "congress-legislators").refreshed, /every 20 hours/);
  assert.match(ingest, /SPONSORSHIP_REFRESH_MS = 7 \* 24 \* 3600 \* 1000/);
  assert.match(SOURCES.find(s => s.id === "govinfo").refreshed, /once a week per bill/);
  assert.match(depth, /const DEPTH_PER_RUN = 25;/);
  assert.match(SOURCES.find(s => s.id === "congress-gov").refreshed, /25 bills per update/);
  assert.match(texas, /TEXAS_MAX_REQUESTS_PER_RUN \?\? "12"/);
  assert.match(SOURCES.find(s => s.id === "open-states").refreshed, /at most 12 requests/);
});

/* ───────── Labels, summaries ───────── */

test("the labels explained are the three the site uses", () => {
  assert.deepEqual(LABELS.map(l => l.label), ["Official", "Analysis", "Your view"]);
  const badges = read("components/federal/badges.tsx");
  for (const l of LABELS) assert.ok(badges.includes(`>${l.label}</span>`), `the ${l.label} badge exists`);
});

test("the summary rules on the page are the limits the checker enforces", () => {
  const part = name => SUMMARY_PARTS.find(p => p.part === name).rule;
  assert.equal(HEADLINE_WORDS, 15); assert.match(part("Headline"), /At most 15 words/);
  assert.equal(LIMITS.plainWords, 80); assert.match(part("In plain English"), /at most 80 words/);
  assert.deepEqual([STRUCTURE_LIMITS.changesMin, STRUCTURE_LIMITS.changesMax], [2, 6]); assert.match(part("What would change"), /Two to six rows/);
  assert.deepEqual([STRUCTURE_LIMITS.todayMin, STRUCTURE_LIMITS.todayMax], [3, 5]); assert.match(part("How it works today"), /Three to five/);
  assert.equal(LIMITS.maxUnknowns, 3); assert.match(part("What we don't know"), /One to three/);
  assert.ok(part("The case for and the case against").includes(NO_REASONS_FOUND), "the page quotes the exact no-reasons line");
  assert.equal(LIMITS.gradeFail, 12); assert.ok(WRITTEN_CHECKS.some(c => /12th-grade/.test(c)));
  const loaded = WRITTEN_CHECKS.find(c => /loaded words/i.test(c));
  for (const w of ["sweeping", "radical", "common-sense", "bipartisan"]) { assert.ok(BANNED_WORDS.includes(w), `${w} is on the list`); assert.ok(loaded.includes(`“${w}”`), `${w} is given as an example`); }
});

test("who does what: the steps name the same numbers as the code", () => {
  for (const s of SUMMARY_STEPS) assert.ok(["program", "ai", "person"].includes(s.by));
  const step = re => SUMMARY_STEPS.find(s => re.test(s.step));
  assert.equal(SAMPLE_EVERY, 5); assert.equal(step(/one summary in every five/).by, "person");
  // Three attempts in all: the first draft and at most two rewrites.
  assert.match(read("lib/analysis/generate.ts"), /for \(let attempt = 1; attempt <= 3; attempt\+\+\)/);
  assert.equal(step(/at most twice/).by, "ai");
  assert.match(read("lib/analysis/quality.ts"), /visible\.length \* 0\.2/);
  assert.equal(step(/random 20%/).by, "program");
  // A failed or low-confidence summary is held for the editor.
  assert.deepEqual(routeSummary({ checkPassed: false, confidence: "high", sequenceIndex: 0 }), { status: "held", queue: "check_failed" });
  assert.equal(routeSummary({ checkPassed: true, confidence: "low", sequenceIndex: 0 }).status, "held");
  assert.equal(step(/low-confidence/).by, "person");
});

/* ───────── Numbers ───────── */

test("member figures: the method page and the member page say the same thing, and both match the rule", () => {
  const member = read("app/politicians/[id]/page.tsx");
  assert.ok(member.includes("Missed: listed &ldquo;Not Voting&rdquo;"), "member page: missed means listed Not Voting");
  assert.match(MEMBER_STATS_METHOD.missed, /listed “Not Voting”/);
  assert.ok(member.includes("ties, and roll calls with fewer than two other"), "member page: ties and thin roll calls are left out");
  assert.match(MEMBER_STATS_METHOD.withParty, /Ties, and roll calls with fewer than two other members of that party voting, are left out/);
  assert.ok(member.includes("The same method is used for every member. These are counts, not ratings."));
  assert.equal(MEMBER_STATS_METHOD.same, "The same method is used for every member. These are counts, not ratings.");
  // The rule itself: the member's own vote is removed, a tie or fewer than two others gives no answer.
  assert.equal(withPartyMajority("Yea", { Yea: 2, Nay: 0 }), null);
  assert.equal(withPartyMajority("Yea", { Yea: 3, Nay: 2 }), null);
  assert.equal(withPartyMajority("Yea", { Yea: 4, Nay: 2 }), true);
  assert.equal(withPartyMajority("Nay", { Yea: 4, Nay: 2 }), false);
});

test("reader totals: 24 hours, never below 25, Unsure not counted", () => {
  assert.equal(READER_TOTALS.minShown, MIN_SHOWN); assert.equal(MIN_SHOWN, 25);
  assert.equal(READER_TOTALS.waitHours, ACCOUNT_MIN_AGE_MS / 3_600_000); assert.equal(READER_TOTALS.waitHours, 24);
  const rules = READER_TOTALS.rules.join(" ");
  assert.match(rules, /24 hours after the account was created/);
  assert.match(rules, /never shown below 25 answers/);
  assert.ok(rules.includes(`“fewer than ${MIN_SHOWN} so far”`));
  assert.equal(totalsLine("Real people", { support: 20, oppose: 4 }), "Real people: fewer than 25 so far");
  assert.equal(totalsLine("Real people", { support: 20, oppose: 5 }), "Real people: 20 support · 5 oppose");
  assert.equal(positionCounts({ tier: 1, accountCreatedAt: 0, quarantined: false, now: ACCOUNT_MIN_AGE_MS - 1 }), false);
  assert.equal(positionCounts({ tier: 0, accountCreatedAt: 0, quarantined: false, now: 10 * ACCOUNT_MIN_AGE_MS }), false);
  assert.match(rules, /“Unsure” is a private answer\. It is never counted\./);
  // Unsure cannot be stored as a counted answer at all.
  assert.match(read("db/schema.ts"), /counted_stance", sql`\$\{t\.stance\} IN \('support', 'oppose'\)`/);
  assert.ok(read("app/bills/[id]/page.tsx").includes("Not a scientific poll."));
});

test("a claim is checked in six steps", () => {
  assert.equal(CLAIM_STEPS.length, 6);
  assert.match(CLAIM_STEPS[5].text, /CHECKING/);
});

/* ───────── Pledge ───────── */

test("every promise has a way to check it, and none is about money", () => {
  assert.equal(new Set(all.map(p => p.id)).size, all.length);
  for (const p of all) { assert.ok(p.promise.length > 15 && /[.]$/.test(p.promise), `${p.id} is a sentence`); assert.ok(p.check.length > 40, `${p.id} says how to check`); }
  for (const id of ["same-rules", "sources", "both-sides", "corrections", "no-grades", "no-endorsements", "no-news-sources"]) assert.ok(all.some(p => p.id === id), `${id} is promised`);
  // Funding is not decided (docs/DECISIONS.md holds no funding decision), so no promise may speak of it.
  for (const p of all) assert.doesNotMatch(p.promise, /advertis|sponsor|donat|donor|fund|money|paid/i, `${p.id} makes no funding promise`);
  assert.match(FOUNDER_PLACEHOLDERS.fundingPledge.reader, /still to be confirmed by the founder/);
  assert.match(FOUNDER_PLACEHOLDERS.fundingPledge.editor, /^decide the funding rule/);
});

test("the pledge quotes the procedural-vote wording the site really uses", () => {
  const p = PLEDGE_NEVER.find(x => x.id === "no-procedural-spin");
  assert.ok(positionLine("Yea", "procedural").includes("a procedural step (not a vote on the bill itself)"));
  assert.ok(p.check.includes("a procedural step (not a vote on the bill itself)"));
});

test("no page loads a script from another company, except the bot check", () => {
  const offenders = [...files("app"), ...files("components")].filter(f => /createElement\(["']script["']\)|from ["']next\/script["']|<script[^>]+src=|fonts\.(googleapis|gstatic)\.com/.test(read(f)));
  assert.deepEqual(offenders, ["components/verify/turnstile.tsx"], "the pledge and the privacy draft say the only outside script is the Cloudflare bot check");
});

test("the AI service is never handed reader data", () => {
  const callers = [...files("lib"), ...files("app")].filter(f => f !== "lib/trust.ts" && /automated-research|api\.openai\.com/.test(read(f)));
  assert.ok(callers.length >= 4);
  const readerTables = /\b(opinionUserVotes|positionHistory|readerUnsure|readerAccounts|verificationProfiles|countedPositions|readerLocations|readerIssues|readerVisits|readerFeedback|problemReports|userFollows|billFollows|pushSubscriptions)\b/;
  for (const f of callers) assert.doesNotMatch(read(f), readerTables, `${f} calls the AI service and must not read a reader table`);
  assert.equal(PROCESSORS.find(p => p.id === "openai").readerData, false);
});

/* ───────── Privacy: cookies, services, stored data ───────── */

test("every cookie the code sets is on the privacy page, and nothing is listed that the code does not set", () => {
  const found = new Set();
  for (const f of [...files("lib"), ...files("app"), ...files("components")]) {
    if (f === "lib/trust.ts") continue;
    const text = read(f);
    for (const m of text.matchAll(/\b[A-Z][A-Z_]*COOKIE\s*=\s*"([^"]+)"/g)) found.add(m[1]);
    for (const m of text.matchAll(/(?:sessionStorage|localStorage)\.(?:getItem|setItem)\("([^"]+)"/g)) found.add(m[1]);
  }
  const listed = new Set(COOKIES.map(c => c.name));
  assert.equal(listed.size, COOKIES.length, "cookie names are unique");
  for (const name of found) assert.ok(listed.has(name), `The code sets "${name}" but lib/trust.ts COOKIES does not list it. Add it there, with what it is for, so the privacy page shows it.`);
  for (const name of listed) assert.ok(found.has(name), `lib/trust.ts lists "${name}" but the code no longer sets it. Remove it from COOKIES.`);
  for (const c of COOKIES) for (const k of ["purpose", "holds", "lasts"]) assert.ok(c[k].trim().length > 3, `${c.name} has ${k}`);
});

test("cookie lifetimes on the privacy page are the ones in the code", () => {
  const lasts = name => COOKIES.find(c => c.name === name).lasts;
  assert.match(read("lib/trial.ts"), /TRIAL_COOKIE_MAX_AGE_S = 60 \* 24 \* 3600/); assert.equal(lasts("or_trial"), "60 days");
  assert.match(read("lib/accounts.ts"), /READER_SESSION_MS = 90 \* 24 \* 3600 \* 1000/); assert.equal(lasts("or_reader"), "90 days");
  assert.match(read("lib/accounts.ts"), /LINK_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(read("lib/auth.ts"), /SESSION_TTL_MS = 30 \* 24 \* 60 \* 60 \* 1000/); assert.equal(lasts("on_record_session"), "30 days");
  assert.match(read("lib/verify/flow.ts"), /PENDING_MS = 10 \* 60 \* 1000/); assert.equal(lasts("or_pp"), "10 minutes");
  for (const [file, name] of [["lib/location.ts", "or_loc"], ["lib/reader-issues.ts", "or_issues"], ["lib/visits.ts", "or_lv"], ["lib/verify/store.ts", "or_dev"]]) {
    assert.match(read(file), /maxAge: 400 \* 24 \* 3600/); assert.equal(lasts(name), "400 days");
  }
  assert.match(read("app/feedback/actions.ts"), /maxAge: 365 \* 24 \* 3600/); assert.equal(lasts("or_fb"), "365 days");
  assert.match(read("lib/share.ts"), /maxAge: 7 \* 24 \* 3600/); assert.equal(lasts("or_from_share"), "7 days");
  // The place cookie holds district codes only: the saved shape has no ZIP and no street.
  assert.match(read("lib/location.ts"), /export type Location = \{ state: string; congressional: string \| null; stateUpper: string \| null; stateLower: string \| null; source: "zip" \| "address" \}/);
});

test("outside services: who gets reader data, and when", () => {
  assert.equal(new Set(PROCESSORS.map(p => p.id)).size, PROCESSORS.length);
  for (const id of ["vercel", "turso", "resend", "openai", "twilio", "turnstile", "census"]) assert.ok(PROCESSORS.some(p => p.id === id), `${id} is listed`);
  assert.deepEqual(PROCESSORS.filter(p => p.when === "verification").map(p => p.id).sort(), ["turnstile", "twilio", "usps"]);
  // The Postal Service's address check is listed because the code can call it, and says plainly that it is switched off.
  assert.match(PROCESSORS.find(p => p.id === "usps").role, /Switched off/); assert.match(read("lib/verify/config.ts"), /ADDRESS_AUTHORITY/);
  assert.deepEqual(PROCESSORS.filter(p => !p.readerData).map(p => p.id).sort(), ["openai", "social"]);
  for (const p of PROCESSORS) { assert.match(p.url, /^https:\/\//); assert.ok(p.receives.length > 20 && p.role.length > 10); }
});

test("phone and address: the privacy page says what the code does", () => {
  const flow = read("lib/verify/flow.ts"), store = read("lib/verify/store.ts"), schema = read("db/schema.ts");
  const phone = STORED.find(s => s.what === "Phone number").detail, address = STORED.find(s => s.what === "Home address").detail;
  // Phone: only a keyed hash reaches the database; the number itself sits encrypted in a 10-minute cookie.
  assert.match(flow, /const phoneHash = await keyedHash\("phone", phone\)/);
  assert.match(flow, /encryptValue\("pending-phone", phone\)/);
  assert.doesNotMatch(schema.match(/export const verificationProfiles[\s\S]*?\]\);/)[0], /\bphone: text|phoneNumber|phone_number/);
  assert.match(phone, /^Never stored\./); assert.match(phone, /keyed hash/); assert.match(phone, /10 minutes/);
  // Address: geocoded by the Census Bureau, then stored encrypted beside the district code.
  assert.match(flow, /addressCipher: await encryptAddress\(/);
  assert.match(address, /stored encrypted/); assert.match(address, /Census Bureau/);
  // One person, one residence (18 Nov 2026): what is new in the database is on the page.
  assert.match(phone, /kept for 90 days/); assert.match(read("lib/verify/residence.ts"), /phoneHoldMs: 90 \* DAY/);
  assert.match(address, /scrambled fingerprint of the address/); assert.match(address, /state senate and state house/);
  assert.match(flow, /addressKey: await keyedHash\("residence", n\.address\)/, "only a keyed hash of the normalized address is kept");
  assert.doesNotMatch(schema.match(/export const accountResidences[\s\S]*?\]\);/)[0], /street|addressLine|address_line|cipher/i, "no address text in the residence table");
  assert.ok(STORED.some(x => /change or try to change your home address/.test(x.detail) && /cleared after 30 days/.test(x.detail)));
  assert.match(store, /residenceChanges\)\.set\(\{ device: null, ipRange: null \}\)/);
  assert.match(LEGAL_REVIEW.deletionGaps, /for 90 days, the scrambled fingerprint of the phone number/);
  // Retention the page states: 48 hours for rate rows, 30 days for sign-up hashes.
  assert.match(store, /rateEvents\.at, now - 48 \* 3600e3/); assert.match(store, /now - 30 \* 86400e3/);
  assert.ok(STORED.some(s => /48 hours/.test(s.detail))); assert.ok(STORED.some(s => /cleared after 30 days/.test(s.detail)));
  // A legislator lookup saves district codes, never the address typed.
  assert.doesNotMatch(read("app/legislators/actions.ts"), /saveLocation\([^)]*street/);
});

test("account deletion removes what the privacy page says it removes", () => {
  const body = read("lib/verify/store.ts").match(/export async function deleteAccountAndPositions[\s\S]*?\n}/)[0];
  for (const t of ["flaggedPositions", "countedPositions", "opinionUserVotes", "userFollows", "billFollows", "readerLocations", "positionHistory", "readerUnsure", "readerIssues", "readerVisits",
    "alertPrefs", "pushSubscriptions", "alertOutbox", "reminders", "verificationProfiles", "digestSends", "magicLinks", "readerAccounts"]) assert.ok(body.includes(`db.delete(${t})`), `deletion removes ${t}`);
  // A briefing subscription refers to the account: left in place, the database refuses to delete the account row and the email stays.
  // It must be removed before the account, with the bot-check record of each sign-in link.
  assert.ok(body.indexOf("db.delete(briefingSubscriptions)") > 0 && body.indexOf("db.delete(briefingSubscriptions)") < body.indexOf("db.delete(readerAccounts)"), "the briefing subscription goes before the account");
  assert.ok(body.includes("db.delete(linkChallenges)"), "the bot-check record of the sign-in links goes too");
  for (const m of read("db/schema.ts").matchAll(/export const (\w+) = sqliteTable\("[^"]+", \{[^;]*?references\(\(\) => readerAccounts\.id\)/g))
    assert.ok(body.includes(`db.delete(${m[1]})`), `${m[1]} refers to the account, so deletion must remove it first`);
  // What deletion leaves behind is flagged for the lawyer, not hidden: the id row of the invite.
  if (!body.includes("db.delete(appUsers)")) { assert.match(LEGAL_REVIEW.deletionGaps, /random id tied to the invite link/); assert.ok(read("app/privacy/page.tsx").includes('k="deletionGaps"')); }
  assert.ok(read("app/account/page.tsx").includes("Delete my account"), "the button the privacy page names exists");
  assert.ok(read("app/account/page.tsx").includes("Yes, delete everything"));
});

/* ───────── Drafts, markers, placeholders, access ───────── */

test("privacy and terms are marked as drafts, and every legal marker is on a page", () => {
  assert.equal(DRAFT_BANNER, "Draft for legal review. Not yet in force.");
  const privacy = read("app/privacy/page.tsx"), terms = read("app/terms/page.tsx");
  for (const page of [privacy, terms]) { assert.ok(page.includes("<DraftBanner />")); assert.match(page, /robots: \{ index: false, follow: false \}/); }
  for (const key of Object.keys(LEGAL_REVIEW)) {
    const uses = (privacy + terms).split(`k="${key}"`).length - 1;
    assert.equal(uses, 1, `[LEGAL REVIEW: ${key}] appears exactly once across the two drafts`);
  }
  assert.ok(read("components/trust/parts.tsx").includes("[LEGAL REVIEW: {LEGAL_REVIEW[k]}]"));
});

test("the founder's placeholders: the editor sees the prompt, readers see a neutral line", () => {
  assert.equal(FOUNDER_PLACEHOLDERS.who.editor, "your name, where you are based, and one sentence on why you started this.");
  const about = read("app/about/page.tsx"), pledge = read("app/pledge/page.tsx"), parts = read("components/trust/parts.tsx");
  for (const k of ["who", "funding", "contact"]) assert.ok(about.includes(`<Founder k="${k}" draft`), `About has the ${k} placeholder`);
  assert.ok(pledge.includes('<Founder k="fundingPledge" draft={draft} />'));
  assert.ok(parts.includes("[Founder: {p.editor}]"));
  assert.ok(about.includes("is run by its founder; a named profile will be here before public launch."), "readers keep the existing neutral line");
  assert.ok(about.includes("process.env.PUBLIC_CONTACT_EMAIL"), "the contact line depends on PUBLIC_CONTACT_EMAIL");
  for (const href of ["/pledge", "/method", "/corrections", "/privacy", "/terms"]) assert.ok(about.includes(`href="${href}"`), `About links ${href}`);
});

test("the trust pages stay behind the same gate as every reader page, and take the name from the brand", () => {
  for (const p of ["app/method/page.tsx", "app/pledge/page.tsx", "app/about/page.tsx", "app/privacy/page.tsx", "app/terms/page.tsx"]) {
    const t = read(p);
    assert.ok(t.includes("const access = await viewerAccess();"), `${p} asks who is reading`);
    assert.match(t, /if \(!access\.allowed\) return <PublicShell current="\/[a-z]+" access=\{access\}>\{null\}<\/PublicShell>;/, `${p} shows nothing when closed`);
    assert.ok(t.includes("brandTitle("), `${p} takes its title from the brand`);
    assert.doesNotMatch(t, /On Record|Constituent\b/, `${p} does not type the product name`);
  }
  for (const p of ["lib/trust.ts", "components/trust/parts.tsx"]) assert.doesNotMatch(read(p), /On Record|Constituent\b/, `${p} does not type the product name`);
});

test("the footer links the trust pages", () => {
  const shell = read("components/public/public-shell.tsx");
  for (const [href, label] of [["/method", "How this works"], ["/pledge", "Pledge"], ["/privacy", "Privacy"], ["/terms", "Terms"], ["/corrections", "Corrections"], ["/about", "Who runs this"]])
    assert.ok(shell.includes(`{ href: "${href}", label: "${label}" }`), `${label} is in the footer`);
  const info = shell.match(/const INFO_PAGES = new Set\(\[([^\]]+)\]\)/)[1];
  for (const href of ["/pledge", "/privacy", "/terms"]) assert.ok(info.includes(`"${href}"`), `${href} is a footer page, not a menu item`);
});
