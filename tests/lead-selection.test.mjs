import test from "node:test";
import assert from "node:assert/strict";
import { pickNextLead, blockedHosts, hostOf, BLOCKED_HOST_WINDOW_MS } from "../lib/lead-selection.ts";

const queued = [
  { id: "d1", lane: "Democratic", discoveredAt: 300 },
  { id: "d2", lane: "Democratic", discoveredAt: 200 },
  { id: "r1", lane: "Republican", discoveredAt: 100 },
  { id: "e1", lane: "Executive", discoveredAt: 250 },
];

test("a lane that has never been captured is preferred over a lane captured today", () => {
  const last = new Map([["Democratic", 1000], ["Executive", 900]]);
  assert.equal(pickNextLead(queued, last)?.id, "r1");
});

test("among captured lanes, the one longest without a capture goes next", () => {
  const last = new Map([["Democratic", 1000], ["Executive", 900], ["Republican", 950]]);
  assert.equal(pickNextLead(queued, last)?.id, "e1");
});

test("within the chosen lane the newest lead wins, and an empty queue yields nothing", () => {
  const last = new Map([["Republican", 1], ["Executive", 1]]);
  assert.equal(pickNextLead(queued, last)?.id, "d1");
  assert.equal(pickNextLead([], last), undefined);
});

test("hosts that blocked the crawler twice in two weeks are skipped; one block or an old block is not", () => {
  const now = 10 * BLOCKED_HOST_WINDOW_MS;
  const failed = [
    { canonicalUrl: "https://blocked.example.gov/a", error: "Source request failed (403)", completedAt: now - 1000 },
    { canonicalUrl: "https://blocked.example.gov/b", error: "Source request failed (403)", completedAt: now - 5000 },
    { canonicalUrl: "https://once.example.gov/a", error: "Source request failed (403)", completedAt: now - 1000 },
    { canonicalUrl: "https://old.example.gov/a", error: "Source request failed (403)", completedAt: now - BLOCKED_HOST_WINDOW_MS - 1 },
    { canonicalUrl: "https://old.example.gov/b", error: "Source request failed (403)", completedAt: now - BLOCKED_HOST_WINDOW_MS - 2 },
    { canonicalUrl: "https://thin.example.gov/a", error: "No claim candidates", completedAt: now - 1000 },
    { canonicalUrl: "https://thin.example.gov/b", error: "No claim candidates", completedAt: now - 1000 },
    { canonicalUrl: "not a url", error: "403", completedAt: now },
  ];
  assert.deepEqual([...blockedHosts(failed, now)], ["blocked.example.gov"]);
  assert.equal(hostOf("https://A.Example.GOV/x"), "a.example.gov");
  assert.equal(hostOf("nope"), null);
  const leads = [{ id: "x", lane: "Executive", discoveredAt: 5, canonicalUrl: "https://blocked.example.gov/c" }, { id: "y", lane: "Executive", discoveredAt: 1, canonicalUrl: "https://ok.example.gov/c" }];
  assert.equal(pickNextLead(leads, new Map(), blockedHosts(failed, now))?.id, "y");
  assert.equal(pickNextLead(leads, new Map())?.id, "x");
  assert.equal(pickNextLead([leads[0]], new Map(), blockedHosts(failed, now)), undefined);
});
