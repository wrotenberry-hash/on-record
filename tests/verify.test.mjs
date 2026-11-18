import test from "node:test";
import assert from "node:assert/strict";
import { tierFor, positionCounts, countsFrom, normalisePhone, lineTypeAccepted, ipRange, isDisposable, normaliseReason, cleanReason, looksLikePoBox,
  districtFromCensus, memberDistrictId, isSurge, totalsLine, MIN_SHOWN, ACCOUNT_MIN_AGE_MS, ANOMALY } from "../lib/verify/rules.ts";

const base = { emailVerifiedAt: 1, signupChallengeAt: 1, phoneHash: "h", phoneVerifiedAt: 1, districtId: null, addressMatchedAt: null };

test("tiers: email + bot check + phone is a real person; a matched district makes it district-matched", () => {
  assert.equal(tierFor(null), 0);
  assert.equal(tierFor({ ...base, phoneVerifiedAt: null }), 0);
  assert.equal(tierFor({ ...base, signupChallengeAt: null }), 0);
  assert.equal(tierFor({ ...base, emailVerifiedAt: null }), 0);
  assert.equal(tierFor(base), 1);
  assert.equal(tierFor({ ...base, districtId: "TX-07", addressMatchedAt: 2 }), 2);
  assert.equal(tierFor({ ...base, districtId: "TX-07", addressMatchedAt: null }), 1);
});

test("a position counts only for tier 1+, unquarantined, accounts at least 24 hours old", () => {
  const now = 10 * ACCOUNT_MIN_AGE_MS;
  assert.equal(positionCounts({ tier: 1, accountCreatedAt: now - ACCOUNT_MIN_AGE_MS, quarantined: false, now }), true);
  assert.equal(positionCounts({ tier: 1, accountCreatedAt: now - ACCOUNT_MIN_AGE_MS + 1, quarantined: false, now }), false);
  assert.equal(positionCounts({ tier: 0, accountCreatedAt: 0, quarantined: false, now }), false);
  assert.equal(positionCounts({ tier: 2, accountCreatedAt: 0, quarantined: true, now }), false);
  assert.equal(countsFrom(5), 5 + ACCOUNT_MIN_AGE_MS);
});

test("US phone numbers normalise to E.164; others are refused", () => {
  assert.equal(normalisePhone("(512) 555-0100"), "+15125550100");
  assert.equal(normalisePhone("+1 512 555 0100"), "+15125550100");
  assert.equal(normalisePhone("1-512-555-0100"), "+15125550100");
  assert.equal(normalisePhone("555-0100"), null);
  assert.equal(normalisePhone("+44 20 7946 0958"), null);
  assert.equal(normalisePhone("012 555 0100"), null);
});

test("only mobile lines verify: VoIP, virtual, toll-free, landline and unknown are refused", () => {
  assert.equal(lineTypeAccepted("mobile"), true);
  for (const t of ["nonFixedVoip", "fixedVoip", "landline", "tollFree", "pager", "unknown", null]) assert.equal(lineTypeAccepted(t), false, String(t));
});

test("network ranges group IPv4 by /24 and IPv6 by /48", () => {
  assert.equal(ipRange("203.0.113.77"), "203.0.113.0/24");
  assert.equal(ipRange("203.0.113.77, 10.0.0.1"), "203.0.113.0/24");
  assert.equal(ipRange("::ffff:198.51.100.9"), "198.51.100.0/24");
  assert.equal(ipRange("2001:db8:abcd:12:1::5"), "2001:db8:abcd::/48");
  assert.equal(ipRange(""), null);
});

test("disposable domains match on the domain or any parent", () => {
  const list = new Set(["mailinator.com"]);
  assert.equal(isDisposable("mailinator.com", list), true);
  assert.equal(isDisposable("eu.mailinator.com", list), true);
  assert.equal(isDisposable("gmail.com", list), false);
  assert.equal(isDisposable("com", list), false);
});

test("reason text is compared without case, punctuation or spacing; short reasons are not compared", () => {
  assert.equal(normaliseReason("Lower costs for FAMILIES, now!!"), normaliseReason("lower costs for families now"));
  assert.equal(normaliseReason("too short"), null);
  assert.equal(cleanReason("  a  b  "), "a b");
  assert.equal(cleanReason("x".repeat(400)).length, 280);
  assert.equal(cleanReason("   "), null);
});

test("PO boxes are refused for district matching", () => {
  for (const a of ["PO Box 12", "P.O. Box 9", "Post Office Box 4", "123 Main St PMB 7"]) assert.equal(looksLikePoBox(a), true, a);
  assert.equal(looksLikePoBox("123 Box Elder Rd"), false);
});

test("Census geocoder matches become district ids, including at-large seats", () => {
  const m = (cd, st) => ({ geographies: { States: [{ STUSAB: st }], "119th Congressional Districts": [{ CD119: cd, BASENAME: cd }] } });
  assert.deepEqual(districtFromCensus(m("07", "TX")), { districtId: "TX-07", state: "TX" });
  assert.deepEqual(districtFromCensus(m("00", "VT")), { districtId: "VT-AL", state: "VT" });
  assert.deepEqual(districtFromCensus(m("98", "DC")), { districtId: "DC-AL", state: "DC" });
  assert.equal(districtFromCensus({ geographies: { States: [{ STUSAB: "TX" }] } }), null);
  assert.equal(districtFromCensus(null), null);
  assert.equal(memberDistrictId("tx", 7), "TX-07");
  assert.equal(memberDistrictId("VT", 0), "VT-AL");
  assert.equal(memberDistrictId("WY", null), "WY-AL");
});

test("a surge needs the floor and ten times the hourly baseline", () => {
  assert.equal(isSurge(24, 0, ANOMALY.surgeFloor), false);
  assert.equal(isSurge(25, 0, ANOMALY.surgeFloor), true);
  // 7 days of 168 positions is 1 an hour: 25 in an hour is a surge, but not when the baseline is 3 an hour.
  assert.equal(isSurge(25, 168, ANOMALY.surgeFloor), true);
  assert.equal(isSurge(25, 504, ANOMALY.surgeFloor), false);
});

test("totals show only from 25 answers", () => {
  assert.equal(totalsLine("Real people", { support: 20, oppose: 4 }), `Real people: fewer than ${MIN_SHOWN} so far`);
  assert.equal(totalsLine("Real people", { support: 20, oppose: 5 }), "Real people: 20 support · 5 oppose · 0 unsure (25 voters)");
  assert.equal(totalsLine("TX-37", { support: 12, oppose: 6, unsure: 7 }), "TX-37: 12 support · 6 oppose · 7 unsure (25 voters)", "Unsure is a counted answer");
  assert.equal(totalsLine("District-matched", null), `District-matched: fewer than ${MIN_SHOWN} so far`);
});
