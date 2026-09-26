import test from "node:test";
import assert from "node:assert/strict";
import { pickNextLead } from "../lib/lead-selection.ts";

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
