import test from "node:test";
import assert from "node:assert/strict";
import { inviteToken, verifyInviteToken, newInviteId, trialGate, INVITE_ID_PATTERN } from "../lib/trial-token.ts";
import { pageTemplate, dim, isAutomated, utcDay } from "../lib/event-dims.ts";
import { clamp, pageTitle, memberMeta, billMeta, issueMeta, robotsRules, TITLE_MAX, DESCRIPTION_MAX } from "../lib/seo.ts";
import { explainVote, outcomeOf } from "../lib/federal/vote-labels.ts";

const SECRET = "test-secret-not-real";

test("an invite token verifies only with the right secret and is not forgeable", async () => {
  const id = newInviteId();
  assert.match(id, INVITE_ID_PATTERN);
  const token = await inviteToken(SECRET, id);
  assert.equal(await verifyInviteToken(SECRET, token), id);
  assert.equal(await inviteToken(SECRET, id), token, "the same link can be shown again without storing it");
  assert.equal(await verifyInviteToken("other-secret", token), null);
  const [, mac] = token.split(".");
  assert.equal(await verifyInviteToken(SECRET, `${newInviteId()}.${mac}`), null, "a token cannot be moved to another invite");
  for (const bad of ["", null, undefined, "inv_x.abc", `${id}.zz`, `${id}`, `../${token}`]) assert.equal(await verifyInviteToken(SECRET, bad), null);
  assert.equal(await verifyInviteToken("", token), null, "no secret, no access");
});

test("the trial opens only once an OpenAI call has succeeded in production", () => {
  assert.equal(trialGate(null).open, false);
  assert.equal(trialGate(undefined).open, false);
  assert.equal(trialGate(Date.parse("2026-11-15T19:01:00Z")).open, true);
});

test("usage counts never carry an id: pages are counted by type", () => {
  assert.equal(pageTemplate("/politicians/C001056"), "/politicians/[id]");
  assert.equal(pageTemplate("/bills/119-hr-2102?x=1"), "/bills/[id]");
  assert.equal(pageTemplate("/issues/health-care/"), "/issues/[slug]");
  assert.equal(pageTemplate("/records/abc#top"), "/records/[id]");
  assert.equal(pageTemplate("/"), "/");
  assert.equal(pageTemplate("/politicians"), "/politicians");
  assert.equal(pageTemplate("/editor/trial"), "other");
  assert.equal(dim("trial", "/bills/[id]"), "trial:/bills/[id]");
  assert.equal(utcDay(Date.parse("2026-11-15T23:59:00Z")), "2026-11-15");
});

test("automated clients are not counted", () => {
  assert.ok(isAutomated("Googlebot/2.1 (+http://www.google.com/bot.html)"));
  assert.ok(isAutomated("vercel-screenshot/1.0"));
  assert.ok(isAutomated("curl/8.5"));
  assert.ok(isAutomated(""));
  assert.ok(isAutomated(null));
  assert.ok(!isAutomated("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"));
});

test("titles and descriptions stay within search limits", () => {
  assert.equal(clamp("short", 10), "short");
  assert.ok(clamp("a very long sentence that goes on", 12).length <= 12);
  const m = memberMeta({ fullName: "John Cornyn", chamber: "senate", party: "Republican", state: "TX", district: null });
  assert.equal(m.title, "John Cornyn: votes · On Record");
  assert.match(m.description, /U\.S\. Senator from TX/);
  const long = billMeta({ label: "H.R. 2102", title: "Major Richard Star Act to provide for concurrent receipt of veterans' disability compensation and retired pay" }, "Would let more disabled military retirees collect both payments.");
  assert.ok(long.title.length <= TITLE_MAX, long.title);
  assert.ok(long.description.length <= DESCRIPTION_MAX);
  assert.ok(pageTitle("x".repeat(100)).endsWith(" · On Record"));
  assert.match(issueMeta("Health care").title, /^Health care: bills in Congress/);
  assert.match(memberMeta({ fullName: "A B", chamber: "house", party: "Democrat", state: "WY", district: 0 }).description, /WY at large/);
});

test("crawlers are shut out while public reading is off", () => {
  assert.deepEqual(robotsRules(false, "https://x.test"), { rules: [{ userAgent: "*", disallow: "/" }] });
  const open = robotsRules(true, "https://x.test");
  assert.equal(open.sitemap, "https://x.test/sitemap.xml");
  assert.ok(open.rules[0].disallow.includes("/editor") && open.rules[0].disallow.includes("/trial"));
});

test("every vote question in the stored data gets a plain line or is left as official wording", () => {
  // The 20 question wordings in the House and Senate roll calls stored on 15 Nov 2026.
  const stored = ["On the Cloture Motion", "On Motion to Suspend the Rules and Pass, as Amended", "On Passage", "On the Nomination", "On the Amendment",
    "On Agreeing to the Resolution", "On Cloture on the Motion to Proceed", "On Motion to Suspend the Rules and Pass", "On the Motion to Proceed",
    "On Passage of the Bill", "On Ordering the Previous Question", "On the Motion to Table", "On the Motion to Discharge", "On the Concurrent Resolution",
    "On Motion to Table", "On Motion to Suspend the Rules and Concur in the Senate Amendments", "On Motion to Refer", "On Motion to Recommit",
    "On Motion to Discharge", "On Motion to Concur in the Senate Amendments"];
  for (const q of stored) assert.ok(explainVote(q), `no explanation for ${q}`);
  assert.match(explainVote("On Cloture on the Motion to Proceed"), /end debate on whether to take the bill up/);
  assert.match(explainVote("On Motion to Suspend the Rules and Concur in the Senate Amendments"), /accept the Senate's changes/);
  assert.match(explainVote("On Motion to Suspend the Rules and Pass, as Amended"), /two-thirds/);
  assert.equal(explainVote("On Something Unheard Of"), null, "unknown wording is not guessed");
});

test("vote outcomes read from the official result wording", () => {
  assert.equal(outcomeOf("Cloture on the Motion to Proceed Rejected"), "failed");
  assert.equal(outcomeOf("Motion to Table Agreed to"), "passed");
  assert.equal(outcomeOf("Nomination Confirmed"), "passed");
  assert.equal(outcomeOf("Failed"), "failed");
  assert.equal(outcomeOf(null), null);
});
