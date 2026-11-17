import test from "node:test";
import assert from "node:assert/strict";
import { reportPagePath, reportSubject, safePagePath } from "../lib/report-page.ts";

test("only a path on this site is kept, and never the report page itself", () => {
  assert.equal(safePagePath("/bills/119-hr-2347"), "/bills/119-hr-2347");
  assert.equal(safePagePath("/bills/119-hr-2347/"), "/bills/119-hr-2347");
  assert.equal(safePagePath("/"), "/");
  for (const bad of ["", null, undefined, "bills/1", "//evil.example/x", "https://evil.example/x", "/\\evil.example", "/report", "/report?page=/x", "/api/errors", "/editor/problems", "/a\nb"]) assert.equal(safePagePath(bad), null, String(bad));
});

test("the query is dropped, except where it says which item is on the page", () => {
  assert.equal(safePagePath("/search?q=my+private+words"), "/search");
  assert.equal(safePagePath("/account/verify?t=sign-in-token"), "/account/verify");
  assert.equal(safePagePath("/bills/119-hr-1?c=counted&reported=ok"), "/bills/119-hr-1");
  assert.equal(safePagePath("/share/card?t=vote&member=C001056&roll=senate-119-2-258&from=share"), "/share/card?t=vote&member=C001056&roll=senate-119-2-258");
  assert.equal(safePagePath("/compare?a=C001056&b=C001098&x=1"), "/compare?a=C001056&b=C001098");
  assert.equal(safePagePath("/share/card?t=vote&member=<script>"), "/share/card?t=vote");
  assert.ok(safePagePath("/" + "x".repeat(900)).length <= 280);
});

test("the page a reader came from wins over the kind of page named in the link", () => {
  const host = "on-record.example";
  assert.equal(reportPagePath({ queryPage: "/bills/[id]", referer: `https://${host}/bills/119-hr-2347?c=1`, host }), "/bills/119-hr-2347");
  assert.equal(reportPagePath({ queryPage: "/share/card", referer: `https://${host}/share/card?t=vote&member=M1&roll=r-1`, host }), "/share/card?t=vote&member=M1&roll=r-1");
  // no Referer (privacy settings): fall back to what the link said
  assert.equal(reportPagePath({ queryPage: "/texas", referer: null, host }), "/texas");
  assert.equal(reportPagePath({ queryPage: "/bills/[id]", referer: null, host }), "/bills/[id]");
  // a Referer from another site, or from the report page after sending, is ignored
  assert.equal(reportPagePath({ queryPage: "/texas", referer: "https://evil.example/bills/1", host }), "/texas");
  assert.equal(reportPagePath({ queryPage: "/bills/119-hr-2347", referer: `https://${host}/report?page=%2Fbills%2F119-hr-2347`, host }), "/bills/119-hr-2347");
  // an exact page in the link is kept when the reader came from somewhere else on the site
  assert.equal(reportPagePath({ queryPage: "/bills/119-hr-2347", referer: `https://${host}/texas`, host }), "/bills/119-hr-2347");
  assert.equal(reportPagePath({ queryPage: null, referer: null, host }), "/");
  assert.equal(reportPagePath({ queryPage: "https://evil.example", referer: "not a url", host }), "/");
});

test("the subject of a report is the kind of page", () => {
  assert.equal(reportSubject("/bills/[id]", "/bills/119-hr-2347"), "/bills/[id]");
  assert.equal(reportSubject(null, "/share/card?t=vote&member=M1"), "/share/card");
});
