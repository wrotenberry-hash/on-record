import test from "node:test";
import assert from "node:assert/strict";
import { breakage, cleanDigest, cleanMessage, isCriticalRoute, isExpectedError, isNoise, isReaderRoute, routeFromFile, routePattern, topErrors, withRouteType, ERROR_MESSAGE_MAX } from "../lib/error-rules.ts";

const NOW = Date.UTC(2026, 10, 17, 15, 0, 0), MIN = 60e3, HOUR = 3600e3;
const row = (o = {}) => ({ day: "2026-11-17", source: "server", route: "/bills/[id]", message: "Cannot read properties of undefined", n: 1, firstAt: NOW - 10 * MIN, lastAt: NOW - 10 * MIN, ...o });

test("a route pattern never carries a query, an id or a token", () => {
  assert.equal(routePattern("/bills/119-hr-2347?c=counted#your-view"), "/bills/[id]");
  assert.equal(routePattern("/politicians/C001056"), "/politicians/[id]");
  assert.equal(routePattern("/trial/inv_abcdefghij.0123456789abcdef0123456789abcdef"), "/trial/[id]");
  assert.equal(routePattern("/trial/inv_abcdefghij.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "/trial/[id]", "a token is replaced even when it has no digit");
  assert.equal(routePattern("/s/Ab3xZ"), "/s/[id]");
  assert.equal(routePattern("/texas/members/ocd-person%2Fhd54"), "/texas/members/[id]");
  assert.equal(routePattern("/issues/health-care"), "/issues/[id]");
  assert.equal(routePattern("/share/card?t=vote&member=C001056&roll=senate-119-2-258"), "/share/card");
  assert.equal(routePattern("/account/verify?t=secret-token"), "/account/verify");
  assert.equal(routePattern("/"), "/");
  assert.equal(routePattern("/dashboard/texas"), "/dashboard/texas");
  assert.equal(routePattern("/search/someone@example.com"), "/search/[id]", "anything that is not a plain word is treated as an id");
  for (const bad of ["", null, undefined, "https://evil.example/x", "javascript:alert(1)"]) assert.equal(routePattern(bad), "other");
  assert.ok(routePattern("/" + "a/".repeat(60)).length <= 80);
});

test("the route file Next reports becomes the same pattern the browser would report", () => {
  assert.equal(routeFromFile("/app/bills/[id]/page"), "/bills/[id]");
  assert.equal(routeFromFile("/bills/[id]/page"), "/bills/[id]");
  assert.equal(routeFromFile("/app/trial/[token]/route"), "/trial/[id]");
  assert.equal(routeFromFile("/app/issues/[slug]/page"), routePattern("/issues/taxes"));
  assert.equal(routeFromFile("/app/page"), "/");
  assert.equal(routeFromFile("/app/api/automation/health/route"), "/api/automation/health");
  assert.equal(withRouteType("/bills/[id]", "action"), "/bills/[id] (action)");
  assert.equal(withRouteType("/bills/[id]", "render"), "/bills/[id]");
});

test("a stored message is one short line with nothing a reader typed or was shown", () => {
  const m = cleanMessage(`Failed query: select * from x where email = "jo@example.com" and id = 'inv_abcdefghij.0123456789abcdef0123456789abcdef'\n  at stack line`);
  assert.ok(!m.includes("jo@example.com") && !m.includes("inv_") && !m.includes("stack"));
  assert.equal(cleanMessage("fetch failed for https://api.example.com/v1/x?key=abc123"), "fetch failed for [link]");
  assert.equal(cleanMessage("User 1234567 not found in 550e8400-e29b-41d4-a716-446655440000"), "User # not found in [id]");
  assert.equal(cleanMessage("x".repeat(500)).length, ERROR_MESSAGE_MAX);
  assert.equal(cleanMessage(""), "unknown error");
  assert.equal(cleanMessage(null), "unknown error");
  assert.equal(cleanMessage("Row 12 and row 99"), "Row 12 and row 99", "small numbers stay, so the message still says something");
  assert.equal(cleanMessage("a   b\tc"), "a b c");
  assert.equal(cleanDigest("1234567890"), "1234567890");
  for (const bad of ["", "has space", "x".repeat(41), "<script>", null]) assert.equal(cleanDigest(bad), null);
});

test("redirects, not-found and dropped connections are not errors", () => {
  assert.ok(isExpectedError({ digest: "NEXT_REDIRECT;replace;/start;307;" }));
  assert.ok(isExpectedError({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  assert.ok(isExpectedError({ digest: "NEXT_NOT_FOUND" }));
  assert.ok(isExpectedError({ digest: "DYNAMIC_SERVER_USAGE" }));
  assert.ok(isExpectedError({ name: "AbortError", message: "This operation was aborted" }));
  assert.ok(isExpectedError({ code: "ECONNRESET", message: "aborted" }));
  assert.ok(!isExpectedError(new TypeError("Cannot read properties of undefined (reading 'id')")));
  assert.ok(!isExpectedError({ digest: "2839204857", message: "boom" }));
  assert.ok(!isExpectedError(null));
});

test("which routes count as a reader's, and which are critical", () => {
  for (const r of ["/", "/bills/[id]", "/api/cards/g", "/account", "/share/card"]) assert.ok(isReaderRoute(r), r);
  for (const r of ["/editor", "/editor/metrics", "/api/editor/cases", "/api/automation/tick", "/api/ingest/federal", "/skip"]) assert.ok(!isReaderRoute(r), r);
  for (const r of ["/login", "/login (action)", "/trial/[id]", "/account/verify", "/api/automation/health", "/bills/[id] (action)", "/account (action)", "/start (action)"]) assert.ok(isCriticalRoute(r), r);
  for (const r of ["/bills/[id]", "/account", "/start", "/", "/politicians/[id] (action)"]) assert.ok(!isCriticalRoute(r), r);
  assert.ok(isNoise("Failed to find Server Action [value]. This request might be from an older or newer deployment."));
  assert.ok(!isNoise("Cannot read properties of undefined"));
});

test("no errors, or one stray error on a reader page, is not breakage", () => {
  assert.deepEqual(breakage([], NOW), { broken: false, reasons: [], last24h: { errors: 0, kinds: 0, errorPagesShown: 0 } });
  const one = breakage([row()], NOW);
  assert.equal(one.broken, false);
  assert.deepEqual(one.last24h, { errors: 1, kinds: 1, errorPagesShown: 0 });
  // two different one-offs on two pages
  assert.equal(breakage([row(), row({ route: "/politicians/[id]", message: "other" })], NOW).broken, false);
  // two of the same in an hour: still under three
  assert.equal(breakage([row({ n: 2, firstAt: NOW - 30 * MIN, lastAt: NOW - 5 * MIN })], NOW).broken, false);
});

test("the same server error three times within an hour on a reader page is breakage", () => {
  const b = breakage([row({ n: 3, firstAt: NOW - 40 * MIN, lastAt: NOW - 5 * MIN })], NOW);
  assert.equal(b.broken, true);
  assert.match(b.reasons[0], /\/bills\/\[id\] failed 3 times within an hour/);
});

test("spread thinly over the day is not breakage until it is clearly not a one-off", () => {
  // 4 over 8 hours could be one every two hours
  assert.equal(breakage([row({ n: 4, firstAt: NOW - 8 * HOUR, lastAt: NOW - 5 * MIN })], NOW).broken, false);
  // 7 over 3 hours: some hour must hold at least 3
  assert.equal(breakage([row({ n: 7, firstAt: NOW - 3 * HOUR + MIN, lastAt: NOW - 5 * MIN })], NOW).broken, true);
  // 10 in a day counts however it was spread
  const ten = breakage([row({ n: 10, firstAt: NOW - 20 * HOUR, lastAt: NOW - 5 * MIN })], NOW);
  assert.equal(ten.broken, true);
  assert.match(ten.reasons[0], /10 times in the last 24 hours/);
});

test("old errors are forgotten and the two halves of a burst around midnight are joined", () => {
  assert.equal(breakage([row({ n: 50, firstAt: NOW - 50 * HOUR, lastAt: NOW - 25 * HOUR })], NOW).broken, false);
  const midnight = Date.UTC(2026, 10, 17, 0, 0, 0), now = midnight + 20 * MIN;
  const split = [row({ day: "2026-11-16", n: 2, firstAt: midnight - 10 * MIN, lastAt: midnight - 2 * MIN }), row({ day: "2026-11-17", n: 1, firstAt: midnight + MIN, lastAt: midnight + MIN })];
  assert.equal(breakage(split, now).broken, true);
});

test("one error on sign-in, an invite link, saving an answer or the health probe is breakage", () => {
  for (const route of ["/login", "/trial/[id]", "/account/verify", "/bills/[id] (action)", "/api/automation/health"]) {
    const b = breakage([row({ route })], NOW);
    assert.equal(b.broken, true, route);
    assert.match(b.reasons[0], /failed once/);
  }
});

test("the editor's pages, the scheduler and requests no reader sends never raise the flag", () => {
  assert.equal(breakage([row({ route: "/editor/metrics", n: 40, firstAt: NOW - 30 * MIN, lastAt: NOW })], NOW).broken, false);
  assert.equal(breakage([row({ route: "/api/automation/tick", n: 40, firstAt: NOW - 30 * MIN, lastAt: NOW })], NOW).broken, false);
  assert.equal(breakage([row({ route: "/bills/[id] (action)", message: "Failed to find Server Action [value]", n: 40, firstAt: NOW - 30 * MIN, lastAt: NOW })], NOW).broken, false);
  assert.equal(breakage([row({ route: "/login", message: "Invalid Server Actions request", n: 5 })], NOW).broken, false);
});

test("the error page shown three times in a day is breakage; twice is not", () => {
  const c = (o = {}) => row({ source: "client", route: "/politicians/[id]", message: "An error occurred (digest 123)", ...o });
  assert.equal(breakage([c({ n: 2 })], NOW).broken, false);
  const three = breakage([c({ n: 2 }), c({ route: "/bills/[id]", n: 1 })], NOW);
  assert.equal(three.broken, true);
  assert.equal(three.last24h.errorPagesShown, 3);
  assert.match(three.reasons[0], /error page 3 times/);
  assert.equal(breakage([c({ route: "/editor", n: 9 })], NOW).broken, false, "the editor seeing an error page is not a reader");
});

test("top errors: most frequent first, at most three, last 24 hours only", () => {
  const rows = [row({ message: "a", n: 2 }), row({ message: "b", n: 9 }), row({ message: "c", n: 5 }), row({ message: "d", n: 1 }), row({ message: "old", n: 99, lastAt: NOW - 30 * HOUR })];
  assert.deepEqual(topErrors(rows, NOW).map(t => [t.message, t.n]), [["b", 9], ["c", 5], ["a", 2]]);
  assert.deepEqual(topErrors([], NOW), []);
});
