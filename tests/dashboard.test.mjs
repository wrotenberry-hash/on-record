import test from "node:test";
import assert from "node:assert/strict";
import { stageFromLatestAction, funnel, funnelTakeaway, isPartyLine, parseLeadership } from "../lib/federal/dashboard-rules.ts";

test("stage from the latest official action, implying earlier steps", () => {
  assert.equal(stageFromLatestAction("Became Public Law No: 119-21."), "law");
  assert.equal(stageFromLatestAction("Presented to President."), "passed_both");
  assert.equal(stageFromLatestAction("Vetoed by President."), "vetoed");
  assert.equal(stageFromLatestAction("Received in the Senate and Read twice and referred to the Committee on Finance."), "passed_one");
  assert.equal(stageFromLatestAction("Passed/agreed to in House: On passage Passed by recorded vote: 215 - 214."), "passed_one");
  assert.equal(stageFromLatestAction("Ordered to be Reported (Amended) by the Yeas and Nays: 30 - 20."), "committee");
  assert.equal(stageFromLatestAction("Placed on the Union Calendar, Calendar No. 412."), "committee");
  assert.equal(stageFromLatestAction("Referred to the House Committee on Energy and Commerce."), "filed");
  assert.equal(stageFromLatestAction(null), "filed");
});

test("funnel counts bills that reached at least each stage", () => {
  const f = funnel(["filed", "filed", "committee", "passed_one", "law", "vetoed"]);
  assert.deepEqual(f.reach, { filed: 6, committee: 4, passed_one: 3, passed_both: 2, law: 1, vetoed: 1 });
  assert.equal(f.pct.law, 16.7);
  assert.match(funnelTakeaway("House bills", f), /of 6 bills filed, 50% passed at least one chamber and 1 \(16.7%\) became law; 33.3% have had no committee action/);
  assert.equal(funnelTakeaway("X", funnel([])), "X: no bills filed yet.");
});

test("party-line votes need both parties mostly on opposite sides", () => {
  assert.equal(isPartyLine({ Yea: 210, Nay: 2 }, { Yea: 5, Nay: 200 }), true);
  assert.equal(isPartyLine({ Yea: 210, Nay: 2 }, { Yea: 200, Nay: 5 }), false);
  assert.equal(isPartyLine({ Yea: 5, Nay: 2 }, { Yea: 1, Nay: 200 }), false, "too few Democrats voting");
  assert.equal(isPartyLine({ Yea: 100, Nay: 100 }, { Yea: 1, Nay: 200 }), false, "tie");
});

test("leadership roles from congress-legislators", () => {
  const l = parseLeadership([{ id: { bioguide: "J000299" }, name: { official_full: "Mike Johnson" }, leadership_roles: [{ title: "Speaker of the House", chamber: "house", start: "2023-10-25" }] },
    { id: { bioguide: "X" }, leadership_roles: [{ title: "Majority Whip", chamber: "senate", start: "2021-01-01", end: "2023-01-03" }] }]);
  assert.deepEqual(l, [{ politicianId: "J000299", name: "Mike Johnson", title: "Speaker of the House", chamber: "house", start: "2023-10-25" }]);
});

test("said vs did: only explicit statements naming a bill, compared with the passage vote, same rule for everyone", async () => {
  const { saidAboutBill, saidVsDid } = await import("../lib/said-did-rules.ts");
  assert.deepEqual(saidAboutBill("I will vote for H.R. 2102 because veterans earned it."), { label: "H.R. 2102", type: "hr", number: 2102, stance: "for" });
  assert.equal(saidAboutBill("We oppose S. 45 as written.").stance, "against");
  assert.equal(saidAboutBill("This bill is interesting."), null);
  assert.equal(saidAboutBill("I support veterans and H.R. 9 has problems; I oppose parts of it."), null, "both directions: not explicit");
  assert.equal(saidVsDid("for", "Yea"), "match"); assert.equal(saidVsDid("for", "Nay"), "contradiction");
  assert.equal(saidVsDid("against", "Nay"), "match"); assert.equal(saidVsDid("against", "Not Voting"), null);
});

test("quiet kill: only a procedural vote that stopped the bill", async () => {
  const { isQuietKill } = await import("../lib/said-did-rules.ts");
  assert.equal(isQuietKill("procedural", "On the Cloture Motion", "Cloture Motion Rejected"), true);
  assert.equal(isQuietKill("procedural", "On the Motion to Proceed", "Motion to Proceed Agreed to"), false);
  assert.equal(isQuietKill("procedural", "On Motion to Table", "Motion to Table Agreed to"), true);
  assert.equal(isQuietKill("procedural", "On Motion to Recommit", "Failed"), false);
  assert.equal(isQuietKill("passage", "On Passage", "Failed"), false, "a failed passage vote is a vote on the bill, not a quiet kill");
});

test("sharing rules: same-site targets only, caption beside the image, Bluesky text fits with a whole link", async () => {
  const { shareableTarget, captionWith, blueskyText } = await import("../lib/share-rules.ts");
  assert.equal(shareableTarget("/share/card?t=vote&member=A000001&roll=h-119-1-23"), true);
  assert.equal(shareableTarget("https://evil.example/x"), false); assert.equal(shareableTarget("//evil.example"), false);
  assert.equal(shareableTarget("/editor/trial"), false); assert.equal(shareableTarget("/bills/../editor"), false);
  const link = "https://on-record.example/s/AbC2345";
  const cap = captionWith("Ä ".repeat(200) + "end.", link);
  assert.ok(cap.endsWith(link));
  const { text, facets } = blueskyText(cap, link);
  assert.ok([...text].length <= 300, `length ${[...text].length}`);
  assert.ok(text.endsWith(link));
  const bytes = new TextEncoder().encode(text);
  assert.equal(new TextDecoder().decode(bytes.slice(facets[0].index.byteStart, facets[0].index.byteEnd)), link, "facet byte offsets cover the link exactly");
});

test("since your last visit: the first page of a new visit already knows the previous visit (regression)", async () => {
  const { nextVisit } = await import("../lib/visit-rules.ts");
  const L = Date.UTC(2026, 10, 14, 12), P = Date.UTC(2026, 10, 10, 12), now = L + 2 * 86400e3;
  assert.equal(nextVisit(`${L}|${P}`, now).previous, L, "after a long gap the previous visit is the last one, not the one before it");
  assert.equal(nextVisit(`${L}|${P}`, L + 10 * 60e3).previous, P, "within 30 minutes it is the same visit");
  assert.equal(nextVisit(null, now).previous, null);
});

test("party parity: same rules for every party, drift found in either direction, quiet below 10 per party", async () => {
  const { parityStats, parityDrift, toneHits, partyGroup, sampleFraction, patternOf, MIN_PER_PARTY } = await import("../lib/analysis/parity-rules.ts");
  assert.equal(toneHits("This would protect workers and weaken nothing important."), 3);
  assert.equal(partyGroup("Democrat"), "D"); assert.equal(partyGroup("Republican"), "R"); assert.equal(partyGroup("Independent"), "I");
  const row = (party, n, forW, againstW, tone = "") => ({ party, prose: `${"word ".repeat(n)}${tone}`, forText: "a ".repeat(forW), againstText: "b ".repeat(againstW), forCount: 2, againstCount: 2 });
  const even = [...Array(MIN_PER_PARTY)].flatMap(() => [row("Democrat", 200, 30, 30), row("Republican", 200, 30, 30)]);
  assert.deepEqual(parityDrift(parityStats(even)), { enough: true, findings: [] });
  assert.equal(parityDrift(parityStats(even.slice(0, 6))).enough, false, "under 10 per party: no alert");
  for (const [a, b] of [["Democrat", "Republican"], ["Republican", "Democrat"]]) {
    const skew = [...Array(MIN_PER_PARTY)].flatMap(() => [row(a, 300, 45, 15, "vital crucial harmful costly"), row(b, 200, 30, 30)]);
    const f = parityDrift(parityStats(skew)).findings.join(" ");
    assert.match(f, /Length/); assert.match(f, /Tone words/); assert.match(f, /balance differs/); assert.match(f, /expected 42–58%/);
  }
  assert.equal(sampleFraction([...Array(50).keys()], 0.2).length, 10); assert.equal(sampleFraction([1], 0.2).length, 1); assert.equal(sampleFraction([], 0.2).length, 0);
  assert.equal(patternOf('Headline is 24 words; the limit is 20.'), patternOf('Headline is 31 words; the limit is 20.'));
});

test("cards: link previews show one block; captions do not repeat the title (Round G regressions)", async () => {
  const { visibleBlocks } = await import("../lib/card-content.ts");
  const { captionFromCard } = await import("../lib/share-rules.ts");
  const line = (what) => ({ what, describe: { label: "Official", text: "x" }, vote: "Yea", kindLabel: "Vote", date: "Nov 1, 2026", source: "senate.gov" });
  const card = { eyebrow: "E", title: "S. 5271", subtitle: "", lines: [line("S. 5271: On Cloture"), line("Second")], note: "A note.", footer: "Talk is cheap." };
  assert.equal(visibleBlocks(card, "link").lines.length, 1); assert.equal(visibleBlocks(card, "link").note, null);
  assert.equal(visibleBlocks(card, "story").lines.length, 2); assert.equal(visibleBlocks(card, "feed").note, "A note.");
  assert.equal(captionFromCard(card), "S. 5271: On Cloture: Yea (Nov 1, 2026). A note.");
  assert.equal(captionFromCard({ ...card, title: "Jane Doe" }).startsWith("Jane Doe. S. 5271"), true);
});
